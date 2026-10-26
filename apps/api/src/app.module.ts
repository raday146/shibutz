import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { SkillsController } from './skills/skills.controller';
import { SkillsService } from './skills/skills.service';

@Module({
  imports: [DbModule],
  controllers: [SkillsController],
  providers: [SkillsService],
})
export class AppModule {}
