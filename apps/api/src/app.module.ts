import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { OsrmRoutingGateway } from './gateways/osrm.gateway';
import { ROUTING_GATEWAY, SOLVER_GATEWAY } from './gateways/ports';
import { VroomSolverGateway } from './gateways/vroom.gateway';
import { JobsController } from './jobs/jobs.controller';
import { JobsService } from './jobs/jobs.service';
import { OptimizationController } from './optimization/optimization.controller';
import { OptimizationService } from './optimization/optimization.service';
import { RoutesController } from './routes/routes.controller';
import { RoutesService } from './routes/routes.service';
import { SkillsController } from './skills/skills.controller';
import { SkillsService } from './skills/skills.service';
import { TechniciansController } from './technicians/technicians.controller';
import { TechniciansService } from './technicians/technicians.service';

@Module({
  imports: [DbModule],
  controllers: [SkillsController, TechniciansController, JobsController, OptimizationController, RoutesController],
  providers: [
    SkillsService,
    TechniciansService,
    JobsService,
    OptimizationService,
    RoutesService,
    { provide: ROUTING_GATEWAY, useFactory: () => new OsrmRoutingGateway(process.env.OSRM_URL ?? 'http://localhost:5001') },
    { provide: SOLVER_GATEWAY, useFactory: () => new VroomSolverGateway(process.env.VROOM_URL ?? 'http://localhost:3000') },
  ],
})
export class AppModule {}
