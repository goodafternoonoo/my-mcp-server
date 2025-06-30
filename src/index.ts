import { MCPServer } from 'mcp-framework';
import dotenv from 'dotenv';
dotenv.config();

const server = new MCPServer();

server.start();
