const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

const root = path.resolve(__dirname, '..')

/**
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  projectRoot: __dirname,
  maxWorkers: 2,
  watchFolders: [root],

  resolver: {
    blockList: [
      new RegExp(`${root}/node_modules/.*`),
      new RegExp(`${root}/android/build/.*`),
      new RegExp(`${root}/ios/build/.*`),
    ],

    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(root, 'node_modules'),
    ],
  },

  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
