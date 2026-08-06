import { DriveConnection } from './DriveConnection'
import { GithubConnection } from './GithubConnection'

export function ConnectorsTab() {
  return (
    <section className="section">
      <div>
        <h3>Connectors</h3>
        <p className="hint">
          Pull material in from Google Drive or GitHub. Connections are read-only — synced files land
          in the Data tab index and never leave this browser except when you draft with your AI key.
        </p>
      </div>

      <DriveConnection onChanged={() => undefined} />
      <GithubConnection onChanged={() => undefined} />
    </section>
  )
}
