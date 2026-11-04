import { Ionicons } from '@expo/vector-icons';
import { useNetworkState } from 'expo-network';
import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '@/theme';

type ConnectivityValue = { offline: boolean; checking: boolean };
const ConnectivityContext = createContext<ConnectivityValue>({offline:false,checking:true});

export function ConnectivityProvider({ children }: PropsWithChildren) {
  const state = useNetworkState();
  const value = useMemo(() => ({
    checking: state.isConnected == null && state.isInternetReachable == null,
    offline: state.isConnected === false || state.isInternetReachable === false,
  }),[state.isConnected,state.isInternetReachable]);
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(){ return useContext(ConnectivityContext); }

export function ConnectivityNotice() {
  const { offline } = useConnectivity();
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return <View accessibilityRole="alert" style={[styles.notice,{top:Math.max(8,insets.top+4)}]}><Ionicons name="cloud-offline-outline" size={16} color="white"/><Text style={styles.text}>No internet · Some updates are paused</Text></View>;
}

const styles = StyleSheet.create({
  notice:{position:'absolute',zIndex:100,left:16,right:16,minHeight:42,borderRadius:14,backgroundColor:'#211E20',paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,shadowColor:'#000',shadowOpacity:.16,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:8},
  text:{fontFamily:fonts.bodyBold,fontSize:10,color:'white'},
});
