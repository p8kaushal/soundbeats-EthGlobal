import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { useAccount, useConfig, useSwitchChain, useWriteContract } from 'wagmi'
import { readContract, waitForTransactionReceipt } from 'wagmi/actions'
import { toast } from 'sonner'
import { CHAIN_ID, SOUNDBEATS_ADDRESS, USDC_ADDRESS, soundBeatsAbi } from '../contracts/soundBeats'
import { describeError } from '../lib/errors'

export type TxPhase = 'idle' | 'switching' | 'allowing' | 'allow-confirming' | 'signing' | 'confirming' | 'success' | 'error'

export interface TxState {
  phase: TxPhase
  hash?: `0x${string}`
  error?: string
}

type Address = `0x${string}`

export type ContractCall =
  | { functionName: 'buyAccess'; args: readonly [bigint] }
  | { functionName: 'claimPass'; args: readonly [bigint] }
  | { functionName: 'registerSong'; args: readonly [string, Address, string] }
  | { functionName: 'publishRelease'; args: readonly [bigint, string, number, number, bigint, Address] }
  | { functionName: 'sponsorPasses'; args: readonly [bigint, bigint, string, string] }
  | { functionName: 'setReleaseActive'; args: readonly [bigint, boolean] }

interface RunOptions {
  call: ContractCall
  /** Raw USDC the contract will pull from the wallet. Triggers an approval first if needed. */
  spend?: bigint
  successMessage: string
}

/**
 * One wallet flow: switch to Arc Testnet, approve USDC if the allowance is too low,
 * send the contract call, then wait for the receipt. Every phase reflects a real wallet or chain state.
 */
export function useTx() {
  const config = useConfig()
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()
  const [state, setState] = useState<TxState>({ phase: 'idle' })

  const send = useCallback(
    (call: ContractCall): Promise<Address> => {
      const base = { address: SOUNDBEATS_ADDRESS, abi: soundBeatsAbi, chainId: CHAIN_ID } as const
      switch (call.functionName) {
        case 'buyAccess':
          return writeContractAsync({ ...base, functionName: 'buyAccess', args: call.args })
        case 'claimPass':
          return writeContractAsync({ ...base, functionName: 'claimPass', args: call.args })
        case 'registerSong':
          return writeContractAsync({ ...base, functionName: 'registerSong', args: call.args })
        case 'publishRelease':
          return writeContractAsync({ ...base, functionName: 'publishRelease', args: call.args })
        case 'sponsorPasses':
          return writeContractAsync({ ...base, functionName: 'sponsorPasses', args: call.args })
        case 'setReleaseActive':
          return writeContractAsync({ ...base, functionName: 'setReleaseActive', args: call.args })
      }
    },
    [writeContractAsync],
  )

  const run = useCallback(
    async ({ call, spend, successMessage }: RunOptions): Promise<boolean> => {
      if (!address) {
        setState({ phase: 'error', error: 'Connect your wallet first.' })
        return false
      }
      try {
        if (chainId !== CHAIN_ID) {
          setState({ phase: 'switching' })
          await switchChainAsync({ chainId: CHAIN_ID })
        }

        if (spend && spend > 0n) {
          const balance = await readContract(config, {
            address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: CHAIN_ID,
          })
          if (balance < spend) {
            setState({ phase: 'error', error: 'Not enough USDC. Use "Get test USDC" in the sidebar, then try again.' })
            return false
          }
          const allowance = await readContract(config, {
            address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [address, SOUNDBEATS_ADDRESS], chainId: CHAIN_ID,
          })
          if (allowance < spend) {
            setState({ phase: 'allowing' })
            const approveHash = await writeContractAsync({
              address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [SOUNDBEATS_ADDRESS, spend], chainId: CHAIN_ID,
            })
            setState({ phase: 'allow-confirming', hash: approveHash })
            const approval = await waitForTransactionReceipt(config, { hash: approveHash, chainId: CHAIN_ID })
            if (approval.status !== 'success') throw new Error('The USDC allowance transaction failed.')
          }
        }

        setState({ phase: 'signing' })
        const hash = await send(call)
        setState({ phase: 'confirming', hash })
        const receipt = await waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID })
        if (receipt.status !== 'success') throw new Error('The transaction was reverted onchain.')

        setState({ phase: 'success', hash })
        toast.success(successMessage)
        await queryClient.invalidateQueries({ queryKey: ['catalog'] })
        await queryClient.invalidateQueries({ queryKey: ['me'] })
        return true
      } catch (error) {
        const message = describeError(error)
        if (message === null) setState({ phase: 'idle' })
        else setState({ phase: 'error', error: message })
        return false
      }
    },
    [address, chainId, config, queryClient, send, switchChainAsync, writeContractAsync],
  )

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  const busy =
    state.phase === 'switching' ||
    state.phase === 'allowing' ||
    state.phase === 'allow-confirming' ||
    state.phase === 'signing' ||
    state.phase === 'confirming'

  return { state, run, reset, busy }
}
