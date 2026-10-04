/** Minimal raw D1 contract; every prepared call contains exactly one statement. */
export interface D1Result {success:boolean;meta?:{changes?:number};results?:unknown[]}
export interface D1Statement {
  bind(...values:unknown[]):D1Statement;
  first<T=Record<string,unknown>>():Promise<T|null>;
  all<T=Record<string,unknown>>():Promise<{results:T[]}>;
  run():Promise<D1Result>;
}
export interface D1Database {prepare(sql:string):D1Statement}
export interface RoomRecord {id:string;owner_id:string;invite_code:string;revision:number;updated_at:number;body:string}

export class CoopStore {
  private readonly db:D1Database;
  constructor(db:D1Database){this.db=db;}
  get(id:string){return this.db.prepare('SELECT * FROM axiom_coop_rooms WHERE id = ?').bind(id).first<RoomRecord>();}
  byCode(code:string){return this.db.prepare('SELECT * FROM axiom_coop_rooms WHERE invite_code = ?').bind(code).first<RoomRecord>();}
  async owned(owner:string){return (await this.db.prepare('SELECT * FROM axiom_coop_rooms WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 20').bind(owner).all<RoomRecord>()).results;}
  async allowRequest(user:string,now:number){
    const window=Math.floor(now/10000);
    const row=await this.db.prepare(`INSERT INTO axiom_coop_rate (user_id, window, requests) VALUES (?, ?, 1)
      ON CONFLICT(user_id) DO UPDATE SET window = MAX(axiom_coop_rate.window, excluded.window),
      requests = CASE WHEN excluded.window > axiom_coop_rate.window THEN 1 ELSE MIN(axiom_coop_rate.requests + 1, 91) END
      RETURNING requests`).bind(user,window).first<{requests:number}>();
    return !!row&&row.requests<=90;
  }
  async create(record:RoomRecord){
    // Per-owner slot count and insertion are one SQLite statement, so parallel requests cannot bypass the cap.
    const result=await this.db.prepare(`INSERT INTO axiom_coop_rooms (id, owner_id, invite_code, revision, updated_at, body)
      SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM axiom_coop_rooms WHERE owner_id = ?) < 20`)
      .bind(record.id,record.owner_id,record.invite_code,record.revision,record.updated_at,record.body,record.owner_id).run();
    return result.meta?.changes===1;
  }
  async compareAndSwap(record:RoomRecord,revision:number){
    const result=await this.db.prepare(`UPDATE axiom_coop_rooms SET invite_code = ?, revision = ?, updated_at = ?, body = ?
      WHERE id = ? AND revision = ?`).bind(record.invite_code,record.revision,record.updated_at,record.body,record.id,revision).run();
    return result.meta?.changes===1;
  }
}
