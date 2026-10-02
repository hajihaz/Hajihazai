import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("@/lib/ai/router",()=>({routeChat:vi.fn()}));
import {routeChat} from "@/lib/ai/router";
import {POST} from "@/app/api/jarvis/chat/route";
const route=vi.mocked(routeChat);
const makeRequest=(body:unknown={message:"Hello",context:{},history:[]},opts:{secret?:string;signal?:AbortSignal;raw?:string}={})=>new Request("https://bridge.test/api/jarvis/chat",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+(opts.secret??"unit-bridge-secret"),"x-jarvis-request-id":"unit-request-1"},body:opts.raw??JSON.stringify(body),signal:opts.signal});
describe("JARVIS bridge boundary",()=>{
  beforeEach(()=>{vi.stubEnv("JARVIS_BRIDGE_SECRET","unit-bridge-secret");route.mockReset();route.mockResolvedValue({text:JSON.stringify({reply:"Sir, provider fixture.",actions:[]}),modelId:"groq:gpt-oss-120b",provider:"groq"});vi.spyOn(console,"info").mockImplementation(()=>{});});
  afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.restoreAllMocks();});
  it("keeps authenticated real provider metadata and correlation",async()=>{
    const response=await POST(makeRequest());const data=await response.json();
    expect(response.status).toBe(200);expect(data.reply).toBe("Sir, provider fixture.");expect(data.model).toBe("groq:gpt-oss-120b");
    expect(data.provider).toBe("groq");expect(data.requestId).toBe("unit-request-1");expect(response.headers.get("x-jarvis-request-id")).toBe(data.requestId);
    expect(route.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it("rejects unauthorized calls before the provider",async()=>{expect((await POST(makeRequest({}, {secret:"wrong"}))).status).toBe(401);expect(route).not.toHaveBeenCalled();});
  for(const [name,body,status] of [["empty",{message:" "},400],["null",null,400],["array",[],400],["oversized message",{message:"a".repeat(4001)},413],["oversized body",{message:"Hello",extra:"a".repeat(65536)},413]] as const){
    it("rejects "+name+" input",async()=>{expect((await POST(makeRequest(body))).status).toBe(status);expect(route).not.toHaveBeenCalled();});
  }
  it("rejects malformed JSON",async()=>{expect((await POST(makeRequest({}, {raw:"{"}))).status).toBe(400);expect(route).not.toHaveBeenCalled();});
  it("preserves attendance/assessments while excluding vault and credential fields",async()=>{
    const secret="gsk_"+"x".repeat(32);
    await POST(makeRequest({message:"Hello api_key="+secret,context:{now:"2026-10-02T12:00:00Z",vault:[{password:secret}],attendance:{target:75,overall:{present:211,absent:205},subjects:[{code:"C1",name:"Course",present:2,absent:1,password:secret}]},assessments:[{code:"C1",cla1:{assignment:true}}]},history:Array.from({length:8},()=>({role:"user",content:secret+" z".repeat(900)}))}));
    const messages=route.mock.calls[0][0];const text=JSON.stringify(messages);
    expect(text).not.toContain(secret);expect(text).not.toContain('"vault"');expect(text).not.toContain('"password"');
    const context=JSON.parse(messages[0].content.split("Current JARVIS context:\n")[1]);
    expect(context.attendance.overall.present).toBe(211);expect(context.assessments[0].cla1.assignment).toBe(true);
    expect(messages.length).toBe(6);
  });
  for(const [name,result] of [
    ["all-provider failure",{text:"Could not reach providers",modelId:"none",provider:"groq"}],
    ["empty answer",{text:JSON.stringify({reply:" ",actions:[]}),modelId:"groq:gpt-oss-120b",provider:"groq"}],
    ["malformed JSON",{text:"not json",modelId:"groq:gpt-oss-120b",provider:"groq"}],
    ["wrong provider",{text:JSON.stringify({reply:"text"}),modelId:"x",provider:"unknown"}]
  ]){
    it("does not certify "+name+" as a reply",async()=>{
      route.mockResolvedValue(result as Awaited<ReturnType<typeof routeChat>>);
      const response=await POST(makeRequest());const data=await response.json();
      expect(response.status).toBe(502);expect(data.error).toBe("ai_unavailable");expect(data.reply).toBeUndefined();
    });
  }
  it("rejects arbitrary mutations and bad action numbers/dates",async()=>{
    route.mockResolvedValue({text:JSON.stringify({reply:"Sir, proposals need approval.",actions:[{type:"delete_all",payload:{}},{type:"create_todo",payload:{title:"Task",due:"2026-02-30"}},{type:"update_goal_progress",payload:{goalId:"g1",current:101}},{type:"create_todo",payload:{title:"Review",priority:"high",vault:"private"}}]}),modelId:"groq:gpt-oss-120b",provider:"groq"});
    const response=await POST(makeRequest({message:"Propose changes",context:{goals:[{id:"g1",name:"Reserve",unit:"₹",category:"other",target:100,current:0}]}}));
    const data=await response.json();expect(data.actions).toHaveLength(1);expect(data.actions[0].payload.vault).toBeUndefined();
  });
  it("bounds a provider that ignores cancellation and clears its timer",async()=>{
    vi.useFakeTimers();route.mockImplementation(()=>new Promise(()=>{}));
    const result=POST(makeRequest());await vi.waitFor(()=>expect(route).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(22001);const response=await result;expect(response.status).toBe(504);
    expect(route.mock.calls[0][1]?.signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels on request abort without a success reply",async()=>{
    const controller=new AbortController();route.mockImplementation(()=>new Promise(()=>{}));
    const result=POST(makeRequest(undefined,{signal:controller.signal}));await vi.waitFor(()=>expect(route).toHaveBeenCalled());
    controller.abort();const response=await result;expect(response.status).toBe(499);expect((await response.json()).reply).toBeUndefined();
  });
  it("never exposes or logs raw provider exceptions",async()=>{
    route.mockRejectedValue(new Error("Bearer unit-private-value and full owner state"));
    const response=await POST(makeRequest());const text=await response.text();
    expect(response.status).toBe(502);expect(text).not.toContain("unit-private-value");expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("unit-private-value");
  });
});
