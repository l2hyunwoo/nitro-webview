const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const { withRnHarness } = require('react-native-harness/metro')

const root = path.resolve(__dirname, '..')

/**
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  projectRoot: __dirname,
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

    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'nitro-webview') {
        return {
          filePath: path.join(root, 'src/index.ts'),
          type: 'sourceFile',
        }
      }
      return context.resolveRequest(context, moduleName, platform)
    },
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

// withRnHarness must wrap the final merged config.
module.exports = withRnHarness(mergeConfig(getDefaultConfig(__dirname), config))
