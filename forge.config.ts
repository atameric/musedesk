import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  // Spotlight excludes .noindex directories. A marker in an ordinary
  // output folder alone does not reliably exclude its app bundles.
  outDir: 'out.noindex',
  packagerConfig: {
    asar: true,
    icon: 'assets/icon',
    appBundleId: 'com.github.atameric.musedesk',
  },
  rebuildConfig: {},
  // v1 ships macOS-only unsigned .dmg (plan decision: dmg exclusively).
  // Distinct volume title so the mounted installer disk can't be mistaken
  // for the installed app (both would otherwise read "MuseDesk").
  makers: [new MakerDMG({
    title: 'MuseDesk Installer',
    contents: (options) => [
      // Keep the mounted installer out of Spotlight, without excluding
      // the app once it is copied into /Applications.
      { x: 0, y: 0, type: 'file', path: path.resolve('assets/dmg/.metadata_never_index') },
      { x: 448, y: 344, type: 'link', path: '/Applications' },
      { x: 192, y: 344, type: 'file', path: options.appPath },
    ],
  })],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
