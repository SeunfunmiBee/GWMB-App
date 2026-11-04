import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts } from '@/theme';

type Props = TextInputProps & { label: string; error?: string; password?: boolean };

export function AuthField({ label, error, password, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return <View style={styles.group}><Text style={styles.label}>{label}</Text><View style={[styles.field,error?styles.fieldError:null]}><TextInput {...props} autoCapitalize={props.autoCapitalize ?? 'none'} placeholderTextColor="#A59FA3" secureTextEntry={password&&!visible} style={styles.input}/>{password?<Pressable accessibilityLabel={visible?'Hide password':'Show password'} onPress={()=>setVisible(value=>!value)} hitSlop={10}><Ionicons name={visible?'eye-off-outline':'eye-outline'} size={19} color={colors.muted}/></Pressable>:null}</View>{error?<Text style={styles.error}>{error}</Text>:null}</View>;
}
const styles=StyleSheet.create({group:{marginBottom:16},label:{color:colors.ink,fontSize:11,fontFamily:fonts.bodyBold,marginBottom:8},field:{minHeight:60,borderRadius:15,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,paddingHorizontal:15,flexDirection:'row',alignItems:'center'},fieldError:{borderColor:'#D33A61'},input:{flex:1,minHeight:58,color:colors.ink,fontSize:14,fontFamily:fonts.body,paddingVertical:12},error:{color:'#B62249',fontSize:9,fontFamily:fonts.bodyMedium,marginTop:5}});
