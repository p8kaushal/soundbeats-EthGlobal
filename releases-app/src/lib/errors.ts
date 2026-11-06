import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

const REVERT_MESSAGES: Record<string, string> = {
  AlreadyHasAccess: 'You already have access to this release.',
  ReleaseInactive: 'This release is no longer on sale.',
  NoPassesAvailable: 'No free passes are left for this release.',
  NotArtist: 'Only the artist wallet can do this.',
  NotCreator: 'Only the beatmap creator wallet can do this.',
  InvalidTitle: 'Enter a song title (up to 100 characters).',
  InvalidBeatmapId: 'Enter a beatmap ID (up to 64 characters).',
  InvalidDifficulty: 'Difficulty must be between 1 and 10.',
  InvalidPrice: 'Price must be greater than zero.',
  InvalidQuantity: 'Quantity must be between 1 and 10,000.',
  InvalidBrandName: 'Enter a brand name (up to 64 characters).',
  InvalidLogoURI: 'Logo link is too long.',
  SongNotFound: 'That song does not exist.',
  ReleaseNotFound: 'That release does not exist.',
}

/** Returns null when the user simply closed the wallet prompt (not an error to show). */
export function describeError(error: unknown): string | null {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return null
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      if (name) return REVERT_MESSAGES[name] ?? `Transaction rejected by the contract (${name}).`
    }
    const message = error.shortMessage
    if (/user rejected|user denied/i.test(message)) return null
    if (/insufficient funds|exceeds balance/i.test(message)) {
      return 'Not enough USDC for gas and payment. Use "Get test USDC" in the sidebar.'
    }
    return message
  }
  if (error instanceof Error) {
    if (/user rejected|user denied/i.test(error.message)) return null
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
