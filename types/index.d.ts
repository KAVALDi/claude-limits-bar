export type Shown = boolean

declare module 'claude-code' {
  interface PluginState {
    limits: { isShown: Shown }
  }
}
