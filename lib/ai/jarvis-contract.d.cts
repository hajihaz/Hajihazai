declare const contract: {
  LIMITS: {message:number};
  record(value:unknown):value is Record<string,unknown>;
  text(value:unknown,max:number):string;
  sanitizeContext(value:unknown):{goals:Array<{id:string;target:number}>;[key:string]:unknown};
  sanitizeHistory(value:unknown):Array<{role:"user"|"assistant";content:string}>;
  normalizeReply(value:unknown,goals?:Array<{id:string;target:number}>):{reply:string;actions:Array<{type:string;label:string;payload:Record<string,unknown>}>}|null;
};
export = contract;
