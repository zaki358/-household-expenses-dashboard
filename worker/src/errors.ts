/**
 * HTTPステータスを伴うエラー。ルートの onError で FastAPI互換の {detail} に変換される。
 * repo の ValidationError（常に400）と違い、404・409・502 などを明示したい場合に使う。
 */
export class HttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail)
    this.name = 'HttpError'
  }
}
