import { parseAbi } from 'viem';

// `Transfer` aWETH ke WrappedTokenGateway: satu-satunya tempat pemilik withdraw ETH terlihat (V2).
export const ATokenAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
