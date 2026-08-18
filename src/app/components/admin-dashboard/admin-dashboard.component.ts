import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  dashboard = signal<any>(null);
  departments = signal<any[]>([]);
  employees = signal<any[]>([]);
  simulationResults = signal<any>(null);
  selectedDepartment = signal('');
  numPositions = signal(1);
  loading = signal(false);
  activeTab = signal('dashboard');
  error = signal('');

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadDashboard();
    this.loadDepartments();
    this.loadEmployees();
  }

  loadDashboard() {
    this.apiService.getDashboard().subscribe({
      next: (data) => this.dashboard.set(data),
      error: (error) => this.error.set(error.error?.error || 'Failed to load dashboard')
    });
  }

  loadDepartments() {
    this.apiService.getDepartments().subscribe({
      next: (data) => this.departments.set(data),
      error: (error) => this.error.set(error.error?.error || 'Failed to load departments')
    });
  }

  loadEmployees() {
    this.apiService.getAllEmployees().subscribe({
      next: (data) => this.employees.set(data),
      error: (error) => this.error.set(error.error?.error || 'Failed to load employees')
    });
  }

  runSimulation() {
    if (!this.selectedDepartment() || !this.numPositions()) {
      this.error.set('Please select a department and number of positions');
      return;
    }

    this.loading.set(true);
    this.apiService.simulateAllocation(this.selectedDepartment(), this.numPositions()).subscribe({
      next: (data) => {
        this.simulationResults.set(data);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error.error?.error || 'Simulation failed');
        this.loading.set(false);
      }
    });
  }

  allocateCandidate(employeeId: string, departmentId: string, reason: string) {
    this.apiService.createAllocation(
      employeeId,
      departmentId,
      reason || 'Allocated based on skill match and performance score',
      'Continue developing technical skills and soft skills for better team collaboration'
    ).subscribe({
      next: () => {
        this.error.set('Allocation created successfully');
        setTimeout(() => {
          this.loadDashboard();
          this.simulationResults.set(null);
        }, 1000);
      },
      error: (error) => {
        this.error.set(error.error?.error || 'Failed to create allocation');
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
