export type ValidationErrors<T extends string> = Partial<Record<T,string>>;

export const validators = {
  required:(value:string,label:string)=>value.trim()?null:`${label} is required.`,
  email:(value:string)=>/^\S+@\S+\.\S+$/.test(value.trim())?null:'Enter a valid email address.',
  url:(value:string)=>!value.trim()||/^https?:\/\/\S+$/i.test(value.trim())?null:'Enter a full link beginning with http:// or https://.',
  min:(value:string,count:number,label:string)=>value.trim().length>=count?null:`${label} must be at least ${count} characters.`,
};

export function firstValidationError(errors: Record<string,string|null|undefined>) {
  return Object.values(errors).find((value):value is string=>Boolean(value))??null;
}
