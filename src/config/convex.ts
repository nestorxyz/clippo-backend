import { ConvexHttpClient } from 'convex/browser';
import dotenv from 'dotenv';
dotenv.config();

const convexUrl = process.env.CONVEX_URL;
if (!convexUrl) throw new Error('CONVEX_URL is required');

export const convex = new ConvexHttpClient(convexUrl);
export const api: any = {
  categories: { getByUser: 'categories:getByUser' },
  subCategories: { getByUser: 'subCategories:getByUser' },
  tags: { getByUser: 'tags:getByUser' },
  chat: {
    saveMessage: 'chat:saveMessage',
    getMessagesForBackend: 'chat:getMessagesForBackend',
  },
  links: {
    registerLinkForBackend: 'links:registerLinkForBackend',
    getRecentLinksForUser: 'links:getRecentLinksForUser',
  },
  storage: {
    generateUploadUrl: 'storage:generateUploadUrl',
    getPublicUrl: 'storage:getPublicUrl',
  },
  profiles: {
    getByPhoneNumber: 'profiles:getByPhoneNumber',
    getOrCreateByPhone: 'profiles:getOrCreateByPhone',
  },
};
