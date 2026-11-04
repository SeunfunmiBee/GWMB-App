import * as DocumentPicker from 'expo-document-picker';
import { readSheet } from 'read-excel-file/universal';

export type MentorImportRow=Record<string,unknown>;
export type MentorImportResult={fileName:string;rows:MentorImportRow[];errors:string[];sourceHeaders:string[];rawRows:MentorImportRow[];mapping:Record<string,string>};
export const mentorImportFields=[
  ['','Do not import'],['full_name','Full name'],['email','Email'],['phone','Phone'],['linkedin_url','LinkedIn URL'],['headshot','Headshot URL'],['current_role','Current role'],['organisation','Organisation'],['short_bio','Short bio'],['primary_career_field','Primary career field'],['sub_fields','Sub-fields'],['areas_of_expertise','Areas of expertise'],['mentoring_topics','Mentoring topics'],['mentorship_types','Mentorship types'],['currently_available','Currently available'],['preferred_frequency','Preferred cadence'],['preferred_days','Preferred days'],['preferred_times','Preferred times'],['general_availability','General availability'],['next_available_period','Next available period'],['discovery_available','Discovery availability'],['industry_available','Industry availability'],['one_on_one_available','One-on-one availability'],['one_on_one_capacity','One-on-one capacity'],['booking_link','Booking link'],['available_dates','Available dates'],['recording_consent','Recording consent'],['limitations','Limitations / notes'],['submission_date','Submission date'],['external_identifier','External identifier'],['availability_confirmed_until','Availability confirmed until'],
] as const;

export async function pickMentorImportFile():Promise<MentorImportResult|null>{
  const result=await DocumentPicker.getDocumentAsync({type:['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'],multiple:false,copyToCacheDirectory:true});
  if(result.canceled)return null;
  const asset=result.assets[0];const extension=asset.name.split('.').pop()?.toLowerCase();
  const file=(asset as typeof asset&{file?:Blob}).file;
  const response=file?null:await fetch(asset.uri);
  let rows:unknown[][];
  if(extension==='csv'){
    const text=file?await file.text():await response!.text();rows=parseCsv(text);
  }else{
    const buffer=file?await file.arrayBuffer():await response!.arrayBuffer();rows=await readSheet(buffer);
  }
  return normalizeRows(asset.name,rows);
}

function normalizeRows(fileName:string,rows:unknown[][]):MentorImportResult{
  if(rows.length<2)return{fileName,rows:[],errors:['The file has headings but no mentor answers.'],sourceHeaders:[],rawRows:[],mapping:{}};
  const originalHeaders=rows[0].map(value=>String(value??'').trim());
  const headers=originalHeaders.map(normalizeHeader);
  const rawRows:MentorImportRow[]=[];
  rows.slice(1).forEach((row,index)=>{
    if(row.every(value=>value===null||String(value).trim()===''))return;
    const raw:MentorImportRow={__row:index+2};originalHeaders.forEach((header,column)=>{if(header)raw[header]=row[column] instanceof Date?(row[column] as Date).toISOString():row[column]??''});rawRows.push(raw);
  });
  const mapping=Object.fromEntries(originalHeaders.filter(Boolean).map((header,index)=>[header,headers[index]]));
  return applyMentorColumnMapping({fileName,rows:[],errors:[],sourceHeaders:originalHeaders.filter(Boolean),rawRows,mapping},mapping);
}

export function applyMentorColumnMapping(source:MentorImportResult,mapping:Record<string,string>):MentorImportResult{
  const output:MentorImportRow[]=[];const errors:string[]=[];
  source.rawRows.forEach((raw,index)=>{
    const record:MentorImportRow={};const importAnswers:Record<string,unknown>={};
    source.sourceHeaders.forEach(header=>{const target=mapping[header];const value=raw[header]??'';importAnswers[header]=value;if(target)record[target]=mergeValue(record[target],value)});record.import_answers=importAnswers;
    const email=String(record.email??'').trim();const name=String(record.full_name??'').trim();const row=Number(raw.__row)||index+2;
    if(!email.includes('@'))errors.push(`Row ${row}: a valid email is required.`);
    else if(!name)errors.push(`Row ${row}: full name is required.`);
    else output.push(record);
  });
  return{...source,rows:output,errors,mapping};
}

function normalizeHeader(value:string){
  const base=value.trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'_').replace(/(^_|_$)/g,'');
  const aliases:Record<string,string>={name:'full_name',email_address:'email',phone_number:'phone',telephone:'phone',current_job_title:'current_role',job_title:'current_role',role:'current_role',organization:'organisation',company:'organisation',primary_field:'primary_career_field',career_field:'primary_career_field',industry:'primary_career_field',sub_field:'sub_fields',subfield:'sub_fields',specific_field:'sub_fields',areas_topics_they_can_mentor_on:'areas_of_expertise',topics_they_can_mentor_on:'mentoring_topics',availability_for_discovery_mentorship:'discovery_available',availability_for_industry_mentorship:'industry_available',one_on_one_availability:'one_on_one_available',number_of_1_1_sessions_they_are_willing_to_take_within_a_period:'one_on_one_capacity',one_on_one_capacity_per_month:'one_on_one_capacity',consent_for_applicable_group_mentorship_sessions_to_be_recorded:'recording_consent',linkedin:'linkedin_url',photo:'headshot',profile_photo:'headshot',date_submitted:'submission_date',timestamp:'submission_date'};
  if(aliases[base])return aliases[base];
  const has=(...terms:string[])=>terms.every(term=>base.includes(term));
  if(has('full','name')||has('your','name'))return'full_name';
  if(base.includes('email'))return'email';
  if(base.includes('phone')||base.includes('telephone')||base.includes('mobile_number'))return'phone';
  if(base.includes('linkedin'))return'linkedin_url';
  if(base.includes('headshot')||has('profile','photo')||has('upload','photo'))return'headshot';
  if(has('current','role')||has('job','title')||has('professional','role'))return'current_role';
  if(base.includes('organisation')||base.includes('organization')||has('current','company')||has('place','work'))return'organisation';
  if(base.includes('short_bio')||has('professional','bio')||base==='bio'||has('about','yourself'))return'short_bio';
  if(has('primary','career','field')||has('primary','industry')||has('career','sector'))return'primary_career_field';
  if(base.includes('sub_field')||base.includes('subfield')||has('specific','field')||has('area','specialisation')||has('area','specialization'))return'sub_fields';
  if(has('area','expertise')||has('areas','expertise')||has('topics','mentor')||has('can','mentor','on'))return'areas_of_expertise';
  if(has('guidance','topic')||has('mentoring','topic'))return'mentoring_topics';
  if(has('mentorship','type')||has('types','mentorship')||has('mentorship','offer')||has('mentorship','interested'))return'mentorship_types';
  if(has('preferred','frequency')||has('how','often')||has('frequency','mentor'))return'preferred_frequency';
  if(has('preferred','day')||has('days','available'))return'preferred_days';
  if(has('preferred','time')||has('times','available'))return'preferred_times';
  if(has('general','availability')||has('describe','availability'))return'general_availability';
  if(has('currently','available')||has('available','now'))return'currently_available';
  if(has('next','available')||has('available','period'))return'next_available_period';
  if(has('discovery','availability')||has('available','discovery'))return'discovery_available';
  if(has('industry','availability')||has('available','industry'))return'industry_available';
  if((base.includes('one_on_one')||base.includes('1_1'))&&base.includes('availab'))return'one_on_one_available';
  if((base.includes('one_on_one')||base.includes('1_1'))&&(base.includes('capacity')||base.includes('number')||base.includes('session')))return'one_on_one_capacity';
  if(has('booking','link')||has('calendar','link')||base.includes('calendly'))return'booking_link';
  if(has('available','date')||has('session','date'))return'available_dates';
  if(base.includes('recording')&&(base.includes('consent')||base.includes('agree')||base.includes('permission')))return'recording_consent';
  if(base.includes('limitation')||has('additional','note')||has('anything','else'))return'limitations';
  if(has('submission','date')||has('submitted','at')||base==='date')return'submission_date';
  if(base.includes('submission_id')||base.includes('entry_id')||base.includes('response_id'))return'external_identifier';
  if(has('confirmed','until'))return'availability_confirmed_until';
  return base;
}

function mergeValue(current:unknown,next:unknown){if(current===undefined||current===null||String(current).trim()==='')return next;if(next===undefined||next===null||String(next).trim()==='')return current;return`${String(current).trim()}; ${String(next).trim()}`}

function parseCsv(text:string):unknown[][]{
  const rows:unknown[][]=[];let row:unknown[]=[];let cell='';let quoted=false;
  for(let index=0;index<text.length;index++){
    const char=text[index];const next=text[index+1];
    if(char==='"'&&quoted&&next==='"'){cell+='"';index++;continue}
    if(char==='"'){quoted=!quoted;continue}
    if(char===','&&!quoted){row.push(cell.trim());cell='';continue}
    if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')index++;row.push(cell.trim());if(row.some(value=>String(value).length))rows.push(row);row=[];cell='';continue}
    cell+=char;
  }
  row.push(cell.trim());if(row.some(value=>String(value).length))rows.push(row);return rows;
}
