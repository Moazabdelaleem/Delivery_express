import { registerRootComponent } from 'expo';
import { Text, TextInput } from 'react-native';

import App from './App';

// Disable OS font scaling across the entire app so large OS font settings do not break UI layouts
if (Text.defaultProps) {
  Text.defaultProps.allowFontScaling = false;
  Text.defaultProps.maxFontSizeMultiplier = 1.0;
} else {
  Text.defaultProps = { allowFontScaling: false, maxFontSizeMultiplier: 1.0 };
}

if (TextInput.defaultProps) {
  TextInput.defaultProps.allowFontScaling = false;
  TextInput.defaultProps.maxFontSizeMultiplier = 1.0;
} else {
  TextInput.defaultProps = { allowFontScaling: false, maxFontSizeMultiplier: 1.0 };
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
