import { Redirect, useLocalSearchParams } from 'expo-router';
import { GrowCategoryScreen } from '@/components/GrowCategoryScreen';
import { LearnOverview } from '@/components/LearnOverview';
import { MentorshipOverview } from '@/components/MentorshipOverview';
import { growCategoryBySlug, type GrowSlug } from '@/data/grow';

export default function GrowCategoryRoute(){const{category}=useLocalSearchParams<{category:string}>();const item=growCategoryBySlug[category as GrowSlug];if(!item)return <Redirect href="/grow"/>;if(category==='mentorship')return <MentorshipOverview/>;if(category==='learning')return <LearnOverview/>;return <GrowCategoryScreen category={item}/>}
