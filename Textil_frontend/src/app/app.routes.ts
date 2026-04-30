import { Routes } from '@angular/router';
import { Shell } from './shell/shell';
import { InspectionComponent } from './features/inspection/inspection.component';
import { ConfigurationComponent } from './features/configuration/configuration.component';
import { OperatorComponent } from './features/operator/operator.component';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', redirectTo: 'operator', pathMatch: 'full' },
      { path: 'operator', component: OperatorComponent },
      { path: 'inspection', component: InspectionComponent },
      { path: 'configuration', component: ConfigurationComponent },
    ],
  },
];
