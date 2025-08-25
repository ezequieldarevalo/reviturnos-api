// scripts/verify-token.ts
import 'dotenv/config';
import { verifyLinkToken } from '../src/common/token';

const t = process.argv[2];
console.log(verifyLinkToken(t));
