const isMacCatalyst = process.env.BOTCONNECTOR_MAC_CATALYST === '1';

module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./src/assets/fonts'],
  dependencies: isMacCatalyst
    ? {
        // These packages do not ship Mac Catalyst native slices. The Mac app
        // is Cloud-first; Local AI will use Device Bridge/CLI rather than
        // loading llama/ONNX in-process.
        'llama.rn': {platforms: {ios: null}},
        'onnxruntime-react-native': {platforms: {ios: null}},
      }
    : {},
};
