import 'dotenv/config';
import { signLinkToken } from '../src/common/token';

const id = process.argv[2];
if (!id) {
  console.error('Uso: npx ts-node scripts/gen-token.ts <appointmentId>');
  process.exit(1);
}
console.log(signLinkToken({ appointmentId: id }, 60));
