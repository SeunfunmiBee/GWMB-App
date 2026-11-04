import { supabase } from '@/lib/supabase';

export type CourseProgress={
  user_id:string;
  course_id:string;
  completed_lesson_ids:string[];
  current_lesson_id:string|null;
  started_at:string;
  completed_at:string|null;
  updated_at:string;
};

const key=(userId:string,courseId:string)=>`gwmb-course-progress:${userId}:${courseId}`;
function readLocal(userId:string,courseId:string){try{const value=globalThis.localStorage?.getItem(key(userId,courseId));return value?JSON.parse(value) as CourseProgress:null}catch{return null}}
function writeLocal(progress:CourseProgress){try{globalThis.localStorage?.setItem(key(progress.user_id,progress.course_id),JSON.stringify(progress))}catch{/* Best-effort offline fallback. */}}

export function coursePercent(progress:CourseProgress|null,totalLessons:number){
  if(!progress||!totalLessons)return 0;
  const completed=Array.isArray(progress.completed_lesson_ids)?progress.completed_lesson_ids:[];
  return Math.round(completed.length/totalLessons*100);
}

export async function loadCourseProgress(userId:string,courseId:string){
  const local=readLocal(userId,courseId);
  const{data,error}=await supabase.from('course_progress').select('*').eq('user_id',userId).eq('course_id',courseId).maybeSingle();
  if(error||!data)return{progress:local,cloud:false};
  const progress=data as CourseProgress;writeLocal(progress);return{progress,cloud:true};
}

export async function loadAllCourseProgress(userId:string){
  const{data,error}=await supabase.from('course_progress').select('*').eq('user_id',userId).order('updated_at',{ascending:false});
  if(error)return{progress:[] as CourseProgress[],cloud:false};
  const progress=(data??[]) as CourseProgress[];
  progress.forEach(writeLocal);
  return{progress,cloud:true};
}

export async function startCourse(userId:string,courseId:string,firstLessonId:string){
  const existing=(await loadCourseProgress(userId,courseId)).progress;
  if(existing)return existing;
  const now=new Date().toISOString();
  const progress:CourseProgress={user_id:userId,course_id:courseId,completed_lesson_ids:[],current_lesson_id:firstLessonId,started_at:now,completed_at:null,updated_at:now};
  const{data,error}=await supabase.from('course_progress').upsert(progress,{onConflict:'user_id,course_id'}).select('*').single();
  const saved=!error&&data?data as CourseProgress:progress;writeLocal(saved);return saved;
}

export async function completeCourseLesson(input:{userId:string;courseId:string;lessonId:string;lessonIds:string[]}){
  const loaded=(await loadCourseProgress(input.userId,input.courseId)).progress;
  const now=new Date().toISOString();
  const completed=Array.from(new Set([...(loaded?.completed_lesson_ids??[]),input.lessonId]));
  const nextId=input.lessonIds.find(id=>!completed.includes(id))??null;
  const progress:CourseProgress={user_id:input.userId,course_id:input.courseId,completed_lesson_ids:completed,current_lesson_id:nextId,started_at:loaded?.started_at??now,completed_at:completed.length===input.lessonIds.length?now:null,updated_at:now};
  const{data,error}=await supabase.from('course_progress').upsert(progress,{onConflict:'user_id,course_id'}).select('*').single();
  const saved=!error&&data?data as CourseProgress:progress;writeLocal(saved);return{progress:saved,cloud:!error};
}
