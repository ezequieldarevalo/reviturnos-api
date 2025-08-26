import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as helmet from 'helmet';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.use(
    bodyParser.json({
      verify: (req: any, _res, buf) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        req.rawBody = buf;
      },
    }),
  );
  app.enableCors();
  app.use(helmet.default());
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
