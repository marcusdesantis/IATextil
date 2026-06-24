import { Routes } from '@angular/router';
import { Shell } from './shell/shell';
import { InspectionComponent } from './features/inspection/inspection.component';
import { ConfigurationComponent } from './features/configuration/configuration.component';
import { OperatorComponent } from './features/operator/operator.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { LoginComponent } from './features/login/login.component';
import { UsersComponent } from './features/users/users.component';
import { authGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'operator', pathMatch: 'full' },
      { path: 'operator', component: OperatorComponent },
      { path: 'inspection', component: InspectionComponent, canActivate: [adminGuard] },
      { path: 'dashboard', component: DashboardComponent, canActivate: [adminGuard] },
      { path: 'configuration', component: ConfigurationComponent, canActivate: [adminGuard] },
      { path: 'users', component: UsersComponent, canActivate: [adminGuard] },
    ],
  },
  { path: '**', redirectTo: '' },
];
