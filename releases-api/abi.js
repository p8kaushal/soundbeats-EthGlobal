// Events from SoundBeatsReleases on Arc Testnet (copied from releases-app/src/contracts/soundBeatsAbi.ts).
export const soundBeatsEvents = [
  {
    "type": "event",
    "name": "ReleasePublished",
    "inputs": [
      {
        "name": "releaseId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "songId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "artist",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "beatmapId",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "source",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum SoundBeatsReleases.BeatmapSource"
      },
      {
        "name": "difficulty",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "price",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SongRegistered",
    "inputs": [
      {
        "name": "songId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "artist",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "title",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "metadataURI",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  }
];
