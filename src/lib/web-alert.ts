// react-native-web's Alert.alert does nothing. The admin web build relies on alerts for errors and
// confirmations, so map them to the browser's alert/confirm dialogs.
import { Alert, Platform, type AlertButton } from 'react-native';

if (Platform.OS === 'web') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actions = buttons ?? [];
    const cancel = actions.find(button => button.style === 'cancel');
    const confirm = actions.find(button => button !== cancel);
    if (!cancel) {
      window.alert(text);
      confirm?.onPress?.();
      return;
    }
    if (window.confirm(text)) confirm?.onPress?.();
    else cancel.onPress?.();
  };
}
