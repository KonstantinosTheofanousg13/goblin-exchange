/** Failure to obtain an OAuth token. `status` is set when Blizzard answered with an HTTP error. */
export class BlizzardAuthError extends Error {
  override readonly name = 'BlizzardAuthError';
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Failure calling the Blizzard Game Data API. `status` is set when Blizzard answered with an HTTP error. */
export class BlizzardApiError extends Error {
  override readonly name = 'BlizzardApiError';
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
