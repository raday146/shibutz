import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { SkillsController } from './skills/skills.controller';
import { SkillsService } from './skills/skills.service';
import { TechniciansController } from './technicians/technicians.controller';
import { TechniciansService } from './technicians/technicians.service';

@Module({
  imports: [DbModule],
  controllers: [SkillsController, TechniciansController],
  providers: [SkillsService, TechniciansService],
})
export class AppModule {}
