import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { colors, fonts } from '@/theme';

const documents={
  privacy:{title:'Privacy Policy',updated:'20 October 2026',intro:'GWMB uses personal information to provide membership, learning, mentorship, opportunity and community services.',sections:[
    ['Information we use','Account details, membership identifiers, career interests, learning activity, registrations, applications, attendance, notification preferences and information you choose to submit.'],
    ['How we use it','To operate your account, personalise your journey, verify membership, deliver programmes, protect access, improve the service and communicate important updates.'],
    ['Who can access it','Authorised GWMB administrators can access information required for their role. Chapter administrators only receive chapter-scoped information. We do not sell personal information.'],
    ['Your choices','You can update notification preferences, request a copy of your information, ask for correction or request account deletion from the Privacy Centre.'],
    ['Retention and protection','We retain information only as needed for programme, safety, legal and operational purposes. Access is controlled and sensitive administrative actions are recorded.'],
  ]},
  terms:{title:'Terms of Use',updated:'20 October 2026',intro:'These terms explain the responsible use of the GWMB app and its member services.',sections:[
    ['Your account','Provide accurate information, protect your sign-in details and use only the account that belongs to you. Membership access may require verification against official GWMB records.'],
    ['Community conduct','Treat other members, mentors, speakers and administrators with respect. Harassment, impersonation, fraud and misuse of private information are not permitted.'],
    ['Programmes and opportunities','Availability, eligibility and selection can vary. GWMB does not guarantee admission, employment, funding, mentorship approval or third-party outcomes.'],
    ['Content and tools','Learning and AI-assisted tools provide guidance, not professional guarantees. Review submissions for accuracy and follow any opportunity that prohibits AI-assisted answers.'],
    ['Account action','GWMB may restrict access for abuse, safety concerns, false information or applicable membership rules. You may request deletion from the Privacy Centre.'],
  ]},
} as const;

export default function LegalDocument(){const{document}=useLocalSearchParams<{document:string}>();const content=document==='terms'?documents.terms:documents.privacy;return <Screen><PageHeader title={content.title}/><View style={styles.hero}><View style={styles.icon}><Ionicons name={document==='terms'?'document-text-outline':'shield-checkmark-outline'} size={25} color="white"/></View><Text style={styles.updated}>LAST UPDATED · {content.updated.toUpperCase()}</Text><Text style={styles.intro}>{content.intro}</Text></View><View style={styles.body}>{content.sections.map(([title,copy],index)=><View key={title} style={styles.section}><Text style={styles.number}>{String(index+1).padStart(2,'0')}</Text><View style={{flex:1}}><Text style={styles.title}>{title}</Text><Text style={styles.copy}>{copy}</Text></View></View>)}</View><Text style={styles.note}>Questions or correction requests can be submitted through Help & Support in the app.</Text></Screen>}
const styles=StyleSheet.create({hero:{borderRadius:23,backgroundColor:colors.ink,padding:19},icon:{width:48,height:48,borderRadius:15,backgroundColor:colors.pinkDeep,alignItems:'center',justifyContent:'center'},updated:{fontFamily:fonts.bodyBold,fontSize:8,letterSpacing:1,color:'#E7B4C9',marginTop:18},intro:{fontFamily:fonts.heading,fontSize:20,lineHeight:27,color:'white',marginTop:7},body:{borderRadius:21,borderWidth:1,borderColor:colors.line,backgroundColor:'white',paddingHorizontal:15,marginTop:13},section:{flexDirection:'row',gap:12,paddingVertical:17,borderBottomWidth:1,borderBottomColor:colors.line},number:{fontFamily:fonts.bodyBold,fontSize:8,color:colors.pinkDeep,marginTop:3},title:{fontFamily:fonts.headingBold,fontSize:13,color:colors.ink},copy:{fontFamily:fonts.body,fontSize:10,lineHeight:16,color:colors.muted,marginTop:5},note:{fontFamily:fonts.body,fontSize:8.5,lineHeight:14,color:colors.muted,textAlign:'center',marginVertical:16,paddingHorizontal:24}});
