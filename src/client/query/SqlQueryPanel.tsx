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

      {state.error && <p className="sql-query-error">{state.error}</p>}
      {!state.error && state.queryId && (
        <p className="sql-query-status">
          {state.rowCount} filas visibles{state.truncated ? " de un resultado mayor" : ""}.
        </p>
      )}

      {state.columns.length > 0 && (
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
