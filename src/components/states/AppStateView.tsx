import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

export type AppStateKind = 'empty' | 'loading' | 'error' | 'offline' | 'slow' | 'no-results' | 'session-expired' | 'permission-denied' | 'success';

const stateDefaults: Record<Exclude<AppStateKind, 'loading'>, { icon: keyof typeof Ionicons.glyphMap; eyebrow: string; title: string; copy: string }> = {
  empty: { icon: 'file-tray-outline', eyebrow: 'NOTHING HERE YET', title: 'This space is ready for you.', copy: 'Your activity will appear here when there is something to show.' },
  error: { icon: 'alert-circle-outline', eyebrow: 'SOMETHING WENT WRONG', title: 'We couldn’t load this.', copy: 'Try again. If the problem continues, you can return later without losing your progress.' },
  offline: { icon: 'cloud-offline-outline', eyebrow: 'NO INTERNET', title: 'You’re offline.', copy: 'Reconnect to the internet, then try again.' },
  slow: { icon: 'speedometer-outline', eyebrow: 'SLOW CONNECTION', title: 'This is taking longer than usual.', copy: 'Your connection may be slow. You can keep waiting or try again.' },
  'no-results': { icon: 'search-outline', eyebrow: 'NO RESULTS', title: 'Nothing matches your search.', copy: 'Try a different word or clear your filters.' },
  'session-expired': { icon: 'time-outline', eyebrow: 'SESSION EXPIRED', title: 'Please sign in again.', copy: 'For your security, your session ended. Your saved activity is still safe.' },
  'permission-denied': { icon: 'lock-closed-outline', eyebrow: 'ACCESS NEEDED', title: 'You don’t have access to this area.', copy: 'Use an account with the right access or return to the app.' },
  success: { icon: 'checkmark', eyebrow: 'DONE', title: 'Everything is set.', copy: 'Your update has been saved successfully.' },
};

type Props = {
  kind: Exclude<AppStateKind, 'loading'>;
  title?: string;
  copy?: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
};

export function AppStateView({ kind, title, copy, eyebrow, actionLabel, onAction, secondaryLabel, onSecondary, compact = false }: Props) {
  const state = stateDefaults[kind];
  const positive = kind === 'success';
  return <View accessibilityRole="summary" style={[styles.card, compact && styles.compact]}>
    <View style={[styles.icon, positive && styles.successIcon]}><Ionicons name={state.icon} size={compact ? 22 : 28} color={positive ? '#087553' : colors.pinkDeep}/></View>
    <Text style={[styles.eyebrow, positive && styles.successText]}>{eyebrow ?? state.eyebrow}</Text>
    <Text style={[styles.title, compact && styles.compactTitle]}>{title ?? state.title}</Text>
    <Text style={styles.copy}>{copy ?? state.copy}</Text>
    {onAction && actionLabel ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}><Text style={styles.actionText}>{actionLabel}</Text><Ionicons name="arrow-forward" size={17} color="white"/></Pressable> : null}
    {onSecondary && secondaryLabel ? <Pressable accessibilityRole="button" onPress={onSecondary} style={styles.secondary}><Text style={styles.secondaryText}>{secondaryLabel}</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  card:{width:'100%',borderRadius:24,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:24,alignItems:'center'},
  compact:{padding:18,borderRadius:19},
  icon:{width:60,height:60,borderRadius:20,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},
  successIcon:{backgroundColor:'#E4F7EF'},
  eyebrow:{fontFamily:fonts.bodyBold,fontSize:9,letterSpacing:1,color:colors.pinkDeep,marginTop:17},
  successText:{color:'#087553'},
  title:{fontFamily:fonts.headingBold,fontSize:21,lineHeight:27,color:colors.ink,textAlign:'center',marginTop:7},
  compactTitle:{fontSize:17,lineHeight:22},
  copy:{fontFamily:fonts.body,fontSize:11,lineHeight:18,color:colors.muted,textAlign:'center',marginTop:7,maxWidth:340},
  action:{minHeight:49,borderRadius:15,backgroundColor:colors.ink,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:20},
  actionText:{fontFamily:fonts.bodyBold,fontSize:10,color:'white'},
  secondary:{minHeight:42,paddingHorizontal:14,alignItems:'center',justifyContent:'center',marginTop:5},
  secondaryText:{fontFamily:fonts.bodyBold,fontSize:10,color:colors.pinkDeep},
});
