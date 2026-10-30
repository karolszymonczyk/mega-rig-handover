import { ownerLabel } from '../digest/read-night.js';
import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';
const text = (value: string) => (value === '' ? dash : value);

// A mark says why a row is flagged, in words, so it does not depend on colour.
function marks(row: DigestRow): string[] {
  const found: string[] = [];
  if (row.retries >= 3) found.push('retries ≥ 3');
  if (row.lastStatus === 'fail') found.push('fail');
  return found;
}

export function Digest({ night, data }: { night: string; data: Night }) {
  return (
    <>
      <h1>digest {night}</h1>
      {data.rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
              <th>mark</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const found = marks(row);
              return (
                <tr class={found.length > 0 ? 'warn' : undefined}>
                  <td>{text(row.job)}</td>
                  <td>{ownerLabel(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{text(row.lastStatus)}</td>
                  <td>{text(row.lastError ?? '')}</td>
                  <td>{text(row.firstAt)}</td>
                  <td>{text(row.lastAt)}</td>
                  <td>{found.length > 0 ? found.join(', ') : dash}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data.badLines > 0 && (
        <p>
          {data.badLines} {data.badLines === 1 ? 'line' : 'lines'} in this log could not be read
        </p>
      )}
    </>
  );
}
