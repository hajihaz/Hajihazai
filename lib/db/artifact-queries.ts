import { and, desc, eq } from "drizzle-orm";
import { conversations } from "./schema";
import { db } from "./index";
import { artifactVersions, artifacts } from "./schema";

export async function listArtifacts(userId: string, conversationId?: string) {
  return db.select().from(artifacts).where(and(eq(artifacts.userId,userId), conversationId ? eq(artifacts.conversationId,conversationId) : undefined)).orderBy(desc(artifacts.updatedAt)).limit(100);
}
export async function getArtifact(userId:string,id:string){const [row]=await db.select().from(artifacts).where(and(eq(artifacts.id,id),eq(artifacts.userId,userId)));return row??null;}
export async function createArtifact(userId:string,input:{conversationId?:string|null;title:string;content:string}){const [row]=await db.insert(artifacts).values({userId,conversationId:input.conversationId??null,title:input.title,content:input.content}).returning();await db.insert(artifactVersions).values({artifactId:row.id,userId,title:row.title,content:row.content});return row;}
export async function updateArtifact(userId:string,id:string,input:{title?:string;content?:string}){const existing=await getArtifact(userId,id);if(!existing)return null;const [row]=await db.update(artifacts).set({...input,updatedAt:new Date()}).where(and(eq(artifacts.id,id),eq(artifacts.userId,userId))).returning();if(row && (input.title!==undefined||input.content!==undefined)) await db.insert(artifactVersions).values({artifactId:id,userId,title:row.title,content:row.content});return row??null;}
export async function deleteArtifact(userId:string,id:string){const [row]=await db.delete(artifacts).where(and(eq(artifacts.id,id),eq(artifacts.userId,userId))).returning();return row??null;}
export async function listProjectArtifacts(userId:string,projectId:string){return db.select({id:artifacts.id,title:artifacts.title,content:artifacts.content,conversationId:artifacts.conversationId,updatedAt:artifacts.updatedAt}).from(artifacts).innerJoin(conversations,eq(artifacts.conversationId,conversations.id)).where(and(eq(artifacts.userId,userId),eq(conversations.userId,userId),eq(conversations.projectId,projectId))).orderBy(desc(artifacts.updatedAt)).limit(100);}

export async function listArtifactVersions(userId:string,id:string){return db.select().from(artifactVersions).where(and(eq(artifactVersions.artifactId,id),eq(artifactVersions.userId,userId))).orderBy(desc(artifactVersions.createdAt)).limit(50);}
