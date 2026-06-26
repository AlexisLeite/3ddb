import { observer } from "mobx-react-lite";
import type { PointOfInterest } from "../gallery/PointOfInterest.js";
import type { SqlQueryStore } from "./SqlQueryStore.js";

interface SqlQueryPanelProps {
  point: PointOfInterest;
  queryStore: SqlQueryStore;
}

function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatRowCount(value: number): string {
  return value.toLocaleString("es-UY");
}

function rowStatusLabel(rowCount: number, totalRowCount: number, truncated: boolean): string {
  const visibleNoun = rowCount === 1 ? "fila visible" : "filas visibles";
  if (totalRowCount >= rowCount) {
    const totalNoun = totalRowCount === 1 ? "fila" : "filas";
    const verb = rowCount === 1 ? "muestra" : "muestran";
    return `Se ${verb} ${formatRowCount(rowCount)} de ${formatRowCount(totalRowCount)} ${totalNoun}.`;
  }
  return `${formatRowCount(rowCount)} ${visibleNoun}${truncated ? " de un resultado mayor" : ""}.`;
}

function SqlQueryPanelView({ point, queryStore }: SqlQueryPanelProps) {
  const pointId = point.id;
  const state = queryStore.stateFor(pointId);

  return (
    <section className="sql-query-panel" aria-label="Bounding box del punto">
      <div className="sql-bbox-tools">
        <label>
          <span>BBox m</span>
          <input
            type="number"
            min="25"
            max="2000"
            step="25"
            value={state.bboxMeters}
            onChange={(event) => queryStore.setBboxMeters(pointId, Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          onClick={() => void queryStore.executeBoundingBox(point)}
          disabled={state.isLoading}
        >
          Aplicar bounding box
        </button>
      </div>

      <div className="sql-query-actions">
        <button type="button" onClick={() => void queryStore.clear(pointId)}>
          Sacar bounding box
        </button>
      </div>

      <div className="sql-query-actions">
        <button
          type="button"
          onClick={() => queryStore.showResults(pointId)}
          disabled={!state.queryId || state.columns.length === 0 || state.isLoading}
        >
          Mostrar datos de la consulta
        </button>
      </div>

      {state.error && <p className="sql-query-error">{state.error}</p>}
      {!state.error && state.queryId && (
        <p className="sql-query-status">
          {rowStatusLabel(state.rowCount, state.totalRowCount, state.truncated)}
        </p>
      )}

      {state.isTableVisible && state.columns.length > 0 && (
        <div className="sql-query-table" role="region" aria-label="Resultado bounding box">
          <table>
            <thead>
              <tr>
                {state.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row, rowIndex) => (
                <tr key={`${pointId}-${rowIndex}`}>
                  {state.columns.map((column) => (
                    <td key={column}>{valueLabel(row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Renders the per-stop bounding-box controls and preview table while delegating
 * execution and map synchronization to the MobX query store.
 */
export const SqlQueryPanel = observer(SqlQueryPanelView);
