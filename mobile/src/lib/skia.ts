import { TurboModuleRegistry } from 'react-native';

/**
 * Whether this app build includes Skia (added with radar sweeps and wind particles). An older
 * development build loading newer JS doesn't, so those two features turn off instead of crashing;
 * modules that use Skia are only required when this is true.
 */
export const HAS_SKIA = TurboModuleRegistry.get('RNSkiaModule') != null;
