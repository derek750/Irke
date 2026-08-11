import { DriveConnection } from './DriveConnection'
import { GithubConnection } from './GithubConnection'

export function ConnectorsTab() {
  return (
    <section className="section">
      <DriveConnection onChanged={() => undefined} />
      <GithubConnection onChanged={() => undefined} />
    </section>
  )
}
