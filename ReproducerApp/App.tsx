import { StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <BorderedViews />
    </SafeAreaProvider>
  );
}

// MainActivity sets `view.background.alpha = 128` on the views whose nativeID it names.
function BorderedViews() {
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: safeAreaInsets.top + 32 }]}>
      <Text style={styles.caption}>background alpha untouched</Text>
      <View
        accessible
        accessibilityLabel="red border, background alpha untouched"
        style={styles.box}
      />
      <Text style={styles.caption}>view.background.alpha = 128</Text>
      <View
        accessible
        accessibilityLabel="red border, background alpha 128"
        nativeID="uniform-border"
        style={styles.box}
      />
      <Text style={styles.caption}>
        view.background.alpha = 128, a blue top, right and bottom edge
      </Text>
      <View
        accessible
        accessibilityLabel="red left edge, background alpha 128"
        nativeID="edge-colors"
        style={[styles.box, styles.edgeColors]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 32,
    backgroundColor: '#ffffff',
  },
  caption: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 15,
    color: '#0b1b33',
  },
  box: {
    height: 96,
    borderWidth: 8,
    borderColor: '#ff0000',
    backgroundColor: '#9e9e9e',
  },
  edgeColors: {
    borderTopColor: '#0000ff',
    borderRightColor: '#0000ff',
    borderBottomColor: '#0000ff',
  },
});

export default App;
