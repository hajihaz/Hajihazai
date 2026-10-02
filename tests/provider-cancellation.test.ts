import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("@/lib/ai/health",()=>({refreshSharedHealth:vi.fn().mockResolvedValue(undefined),isKnownUnhealthy:()=>false,recordFailure:vi.fn(),recordSuccess:vi.fn()}));
import {routeChat} from "@/lib/ai/router";
import {providers} from "@/lib/ai/providers";
describe("non-streaming caller cancellation",()=>{
  beforeEach(()=>{
    for(const provider of Object.values(providers))vi.spyOn(provider,"isAvailable").mockReturnValue(false);
    vi.mocked(providers.groq.isAvailable).mockReturnValue(true);
  });
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
  it("does not start an already cancelled route",async()=>{
    const controller=new AbortController();controller.abort();
    const spy=vi.spyOn(providers.groq,"generate");
    await expect(routeChat([{role:"user",content:"Hello"}],{signal:controller.signal})).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
  it("aborts active generation without falling through to other models",async()=>{
    const controller=new AbortController();
    const spy=vi.spyOn(providers.groq,"generate").mockImplementation(async(_,__,opts)=>new Promise((_,reject)=>opts?.signal?.addEventListener("abort",()=>reject(new Error("cancelled")),{once:true})));
    const request=routeChat([{role:"user",content:"Hello"}],{preferredModelId:"groq:gpt-oss-120b",signal:controller.signal,safeErrors:true});
    const checked=expect(request).rejects.toThrow();
    await vi.waitFor(()=>expect(spy).toHaveBeenCalledTimes(1));controller.abort();await checked;
    expect(spy).toHaveBeenCalledTimes(1);
  });
  for(const name of ["groq","openrouter","gemini","ollama"] as const){
    it(name+" passes caller cancellation to fetch",async()=>{
      vi.stubEnv("GROQ_API_KEY","unit-key");vi.stubEnv("OPENROUTER_API_KEY","unit-key");vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY","unit-key");
      let signal:AbortSignal|undefined;
      const fake=vi.fn(async(_,init)=>{signal=init.signal;return new Promise<Response>((_,reject)=>signal?.addEventListener("abort",()=>reject(new DOMException("cancelled","AbortError")),{once:true}))});
      vi.stubGlobal("fetch",fake);
      const controller=new AbortController(),request=providers[name].generate("test-model",[{role:"user",content:"Hello"}],{signal:controller.signal});
      const checked=expect(request).rejects.toThrow();await vi.waitFor(()=>expect(fake).toHaveBeenCalledTimes(1));
      controller.abort();await checked;expect(signal?.aborted).toBe(true);
    });
  }
});
