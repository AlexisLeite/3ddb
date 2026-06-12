import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

const MAX_LINES = 1500;
const MAX_FILES_PER_DIRECTORY = 10;
const ROOT = process.cwd();

const ignoredDirectories = new Set([
  ".git",
  ".playwright-mcp",
  "coverage",
  "dist",
  "node_modules",
]);

const rootIgnoredDirectories = new Set([
  "data",
]);

const ignoredFiles = new Set([
  "package-lock.json",
]);

const checkedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const codeExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

const exportedClassPattern =
  /^\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)\b/gm;
const exportedFunctionPattern =
  /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
const exportedArrowFunctionPattern =
  /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm;
const exportedTypePattern =
  /^\s*export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)\b/gm;
const forbiddenReactHookNames = ["use" + "State", "use" + "Effect"];
const forbiddenReactHookPattern = new RegExp(
  `\\b(?:React\\.)?(${forbiddenReactHookNames.join("|")})\\b`,
  "g",
);

function shouldIgnoreDirectory(directory, entryName) {
  return ignoredDirectories.has(entryName) || (directory === ROOT && rootIgnoredDirectories.has(entryName));
}

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!shouldIgnoreDirectory(directory, entry.name)) {
        yield* walk(join(directory, entry.name));
      }
      continue;
    }

    if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;

    const filePath = join(directory, entry.name);
    if (checkedExtensions.has(extname(entry.name))) {
      yield filePath;
    }
  }
}

async function* walkDirectories(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  yield { directory, entries };

  for (const entry of entries) {
    if (entry.isDirectory() && !shouldIgnoreDirectory(directory, entry.name)) {
      yield* walkDirectories(join(directory, entry.name));
    }
  }
}

function countLines(content) {
  if (content.length === 0) return 0;
  return content.split(/\r\n|\r|\n/).length;
}

function collectMatches(pattern, content, kind) {
  return [...content.matchAll(pattern)].map((match) => ({
    kind,
    name: match[1],
    index: match.index,
  }));
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r\n|\r|\n/).length;
}

function normalizedBlockCommentText(comment) {
  return comment
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/^\s*\* ?/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasLeadingBlockComment(content, index) {
  const beforeExport = content.slice(0, index).trimEnd();
  if (!beforeExport) return false;

  const match = beforeExport.match(/\/\*[\s\S]*\*\/$/);
  if (!match) return false;

  const comment = match[0];
  if (comment.split(/\r\n|\r|\n/).length < 3) return false;

  return normalizedBlockCommentText(comment).length >= 70;
}

function exportedArchitecturalUnits(filePath, content) {
  if (!codeExtensions.has(extname(filePath))) return [];

  return [
    ...collectMatches(exportedClassPattern, content, "class"),
    ...collectMatches(exportedFunctionPattern, content, "function"),
    ...collectMatches(exportedArrowFunctionPattern, content, "function"),
  ];
}

function exportedTypeUnits(filePath, content) {
  if (!codeExtensions.has(extname(filePath))) return [];
  return collectMatches(exportedTypePattern, content, "type");
}

function publicClassMethodUnits(filePath, content) {
  if (!codeExtensions.has(extname(filePath))) return [];
  exportedClassPattern.lastIndex = 0;
  if (!exportedClassPattern.test(content)) {
    exportedClassPattern.lastIndex = 0;
    return [];
  }
  exportedClassPattern.lastIndex = 0;

  const units = [];
  let offset = 0;
  for (const line of content.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (
      line.startsWith("  ") &&
      !line.startsWith("    ") &&
      !trimmed.startsWith("private ") &&
      !trimmed.startsWith("protected ") &&
      !trimmed.startsWith("constructor(")
    ) {
      const methodMatch = line.match(
        /^\s+(?:public\s+)?(?:(?:async|get|set)\s+)?([A-Za-z_$][\w$]*)(?:<[^>{}]+>)?\s*\(/,
      );
      if (methodMatch) {
        units.push({
          kind: "method",
          name: methodMatch[1],
          index: offset + line.indexOf(methodMatch[0].trimStart()),
        });
      }
    }
    offset += line.length + 1;
  }

  return units;
}

function forbiddenReactHookUnits(filePath, content) {
  if (!codeExtensions.has(extname(filePath))) return [];
  return collectMatches(forbiddenReactHookPattern, content, "hook");
}

const oversizedFiles = [];
const overloadedFiles = [];
const overloadedTypeFiles = [];
const mismatchedUnitFiles = [];
const mixedRuntimeAndTypeFiles = [];
const uncommentedExportFiles = [];
const uncommentedPublicMethodFiles = [];
const forbiddenReactHookFiles = [];
const crowdedDirectories = [];

for await (const { directory, entries } of walkDirectories(ROOT)) {
  const checkedFileCount = entries.filter(
    (entry) =>
      entry.isFile() &&
      !ignoredFiles.has(entry.name) &&
      checkedExtensions.has(extname(entry.name)),
  ).length;

  if (checkedFileCount > MAX_FILES_PER_DIRECTORY) {
    crowdedDirectories.push({
      directory: relative(ROOT, directory) || ".",
      fileCount: checkedFileCount,
    });
  }
}

for await (const filePath of walk(ROOT)) {
  const content = await readFile(filePath, "utf8");
  const lineCount = countLines(content);
  const units = exportedArchitecturalUnits(filePath, content);
  const typeUnits = exportedTypeUnits(filePath, content);
  const methodUnits = publicClassMethodUnits(filePath, content);
  const forbiddenHookUnits = forbiddenReactHookUnits(filePath, content);

  if (lineCount > MAX_LINES) {
    oversizedFiles.push({
      filePath: relative(ROOT, filePath),
      lineCount,
    });
  }

  if (units.length > 1) {
    overloadedFiles.push({
      filePath: relative(ROOT, filePath),
      units,
    });
  }

  if (typeUnits.length > 1) {
    overloadedTypeFiles.push({
      filePath: relative(ROOT, filePath),
      typeUnits,
    });
  }

  if (units.length > 0 && typeUnits.length > 0) {
    mixedRuntimeAndTypeFiles.push({
      filePath: relative(ROOT, filePath),
      units,
      typeUnits,
    });
  }

  const uncommentedUnits = [...units, ...typeUnits].filter(
    (unit) => !hasLeadingBlockComment(content, unit.index),
  );
  if (uncommentedUnits.length > 0) {
    uncommentedExportFiles.push({
      filePath: relative(ROOT, filePath),
      units: uncommentedUnits.map((unit) => ({
        ...unit,
        lineNumber: lineNumberForIndex(content, unit.index),
      })),
    });
  }

  const uncommentedMethods = methodUnits.filter(
    (unit) => !hasLeadingBlockComment(content, unit.index),
  );
  if (uncommentedMethods.length > 0) {
    uncommentedPublicMethodFiles.push({
      filePath: relative(ROOT, filePath),
      units: uncommentedMethods.map((unit) => ({
        ...unit,
        lineNumber: lineNumberForIndex(content, unit.index),
      })),
    });
  }

  if (forbiddenHookUnits.length > 0) {
    forbiddenReactHookFiles.push({
      filePath: relative(ROOT, filePath),
      units: forbiddenHookUnits.map((unit) => ({
        ...unit,
        lineNumber: lineNumberForIndex(content, unit.index),
      })),
    });
  }

  if (units.length === 1 || typeUnits.length === 1) {
    const expectedBaseName = (units[0] || typeUnits[0]).name;
    const actualBaseName = basename(filePath, extname(filePath));
    if (actualBaseName !== expectedBaseName) {
      mismatchedUnitFiles.push({
        filePath: relative(ROOT, filePath),
        expectedBaseName,
        actualBaseName,
      });
    }
  }
}

if (oversizedFiles.length > 0) {
  console.error(`Files must be ${MAX_LINES} lines or less.`);
  for (const file of oversizedFiles) {
    console.error(`- ${file.filePath}: ${file.lineCount} lines`);
  }
  process.exitCode = 1;
}

if (overloadedFiles.length > 0) {
  console.error("Files must contain no more than one exported class or function.");
  for (const file of overloadedFiles) {
    const units = file.units
      .map((unit) => `${unit.kind} ${unit.name}`)
      .join(", ");
    console.error(`- ${file.filePath}: ${units}`);
  }
  process.exitCode = 1;
}

if (overloadedTypeFiles.length > 0) {
  console.error("Files must contain no more than one exported type or interface.");
  for (const file of overloadedTypeFiles) {
    const units = file.typeUnits
      .map((unit) => `${unit.kind} ${unit.name}`)
      .join(", ");
    console.error(`- ${file.filePath}: ${units}`);
  }
  process.exitCode = 1;
}

if (mismatchedUnitFiles.length > 0) {
  console.error("Single exported classes or functions must live in a file with the same name.");
  for (const file of mismatchedUnitFiles) {
    console.error(
      `- ${file.filePath}: exports ${file.expectedBaseName}; expected ${file.expectedBaseName}${extname(file.filePath)}`,
    );
  }
  process.exitCode = 1;
}

if (mixedRuntimeAndTypeFiles.length > 0) {
  console.error("Files exporting a class or function must not export types or interfaces.");
  for (const file of mixedRuntimeAndTypeFiles) {
    const runtimeUnits = file.units
      .map((unit) => `${unit.kind} ${unit.name}`)
      .join(", ");
    const typeUnits = file.typeUnits.map((unit) => unit.name).join(", ");
    console.error(`- ${file.filePath}: ${runtimeUnits}; exported types: ${typeUnits}`);
  }
  process.exitCode = 1;
}

if (uncommentedExportFiles.length > 0) {
  console.error(
    "Exported classes, functions, types and interfaces must have a leading block comment with at least 70 characters.",
  );
  for (const file of uncommentedExportFiles) {
    const units = file.units
      .map((unit) => `${unit.kind} ${unit.name} at line ${unit.lineNumber}`)
      .join(", ");
    console.error(`- ${file.filePath}: ${units}`);
  }
  process.exitCode = 1;
}

if (uncommentedPublicMethodFiles.length > 0) {
  console.error(
    "Public class methods must have a leading block comment with at least 70 characters.",
  );
  for (const file of uncommentedPublicMethodFiles) {
    const units = file.units
      .map((unit) => `${unit.name} at line ${unit.lineNumber}`)
      .join(", ");
    console.error(`- ${file.filePath}: ${units}`);
  }
  process.exitCode = 1;
}

if (forbiddenReactHookFiles.length > 0) {
  console.error(
    "React local state and effect hooks are forbidden. Use MobX state classes and class methods for effects.",
  );
  for (const file of forbiddenReactHookFiles) {
    const units = file.units
      .map((unit) => `${unit.name} at line ${unit.lineNumber}`)
      .join(", ");
    console.error(`- ${file.filePath}: ${units}`);
  }
  process.exitCode = 1;
}

if (crowdedDirectories.length > 0) {
  console.error(`Directories must contain ${MAX_FILES_PER_DIRECTORY} checked files or less.`);
  for (const directory of crowdedDirectories) {
    console.error(`- ${directory.directory}: ${directory.fileCount} files`);
  }
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log(
    `All checked files are ${MAX_LINES} lines or less, directories contain ${MAX_FILES_PER_DIRECTORY} checked files or less, contain at most one exported class/function/type/interface, keep single exported units in matching files, do not mix exported runtime units with exported types, use leading block comments of at least 70 characters for exported units and public methods, and avoid forbidden React state/effect hooks.`,
  );
}
