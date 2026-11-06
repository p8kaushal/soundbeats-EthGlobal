import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { useAccount, useConfig, useSwitchChain, useWriteContract } from 'wagmi'
import { readContract, waitForTransactionReceipt } from 'wagmi/actions'
import { toast } from 'sonner'
import { CHAIN_ID, SOUNDBEATS_ADDRESS, USDC_ADDRESS, soundBeatsAbi } from '../contracts/soundBeats'
import { describeError } from '../lib/errors'
import { submitAndConfirm, TransactionUncertainError } from '../lib/transactionRecovery'

export type TxPhase = 'idle' | 'switching' | 'allowing' | 'allow-confirming' | 'signing' | 'confirming' | 'checking' | 'uncertain' | 'success' | 'error'

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
  const running = useRef(false)

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
      if (running.current) return false
      if (!address) {
        setState({ phase: 'error', error: 'Connect your wallet first.' })
        return false
      }
      running.current = true
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
            await submitAndConfirm({
              submit: () => writeContractAsync({
                address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [SOUNDBEATS_ADDRESS, spend], chainId: CHAIN_ID,
              }),
              receipt: hash => waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID, timeout: 15_000, pollingInterval: 3000 }),
              effect: async () => (await readContract(config, {
                address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance',
                args: [address, SOUNDBEATS_ADDRESS], chainId: CHAIN_ID,
              })) >= spend,
              onHash: hash => setState({ phase: 'allow-confirming', hash }),
              onChecking: hash => setState({ phase: 'checking', hash }),
            })
          }
        }

        setState({ phase: 'signing' })
        const hash = await submitAndConfirm({
          submit: () => send(call),
          receipt: hash => waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID, timeout: 15_000, pollingInterval: 3000 }),
          effect: call.functionName === 'buyAccess' || call.functionName === 'claimPass'
            ? () => readContract(config, {
                address: SOUNDBEATS_ADDRESS, abi: soundBeatsAbi, functionName: 'hasAccess',
                args: [call.args[0], address], chainId: CHAIN_ID,
              })
            : undefined,
          onHash: hash => setState({ phase: 'confirming', hash }),
          onChecking: hash => setState({ phase: 'checking', hash }),
        })

        setState({ phase: 'success', hash })
        toast.success(successMessage)
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ['catalog'] }),
          queryClient.invalidateQueries({ queryKey: ['me'] }),
        ])
        return true
      } catch (error) {
        if (error instanceof TransactionUncertainError) {
          setState({ phase: 'uncertain', hash: error.hash, error: error.message })
          return false
        }
        const message = describeError(error)
        if (message === null) setState({ phase: 'idle' })
        else setState({ phase: 'error', error: message })
        return false
      } finally {
        running.current = false
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
    state.phase === 'confirming' ||
    state.phase === 'checking' ||
    state.phase === 'uncertain'

  return { state, run, reset, busy }
}
