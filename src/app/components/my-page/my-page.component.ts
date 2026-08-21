import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-my-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-page.component.html',
  styleUrl: './my-page.component.scss'
})
export class MyPageComponent implements OnInit {
  user: any = null;
  desiredDept = '';
  workLifeBalance = '';
  inquiry = '';
  assignmentDetails: any = null;
  departments: any[] = [];
  isEditing: boolean = false;
  isSaving: boolean = false;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(u => this.user = u);
    this.loadAssignmentDetails();
    this.loadDepartments();
  }

  loadAssignmentDetails() {
    if (this.user?.id) {
      this.apiService.getAssignmentDetails(this.user.id).subscribe(
        (data: any) => {
          this.assignmentDetails = data;
          if (data) {
            this.desiredDept = data.desiredDept || data.careerDesire || data.careerGoals || '';
            this.workLifeBalance = data.workLifeBalance || '';
          }
        this.cdr.detectChanges(); 
        },
        () => {
          this.assignmentDetails = null;
          this.cdr.detectChanges(); // エラー時も念のため追加
        }
      );
    }
  }

  loadDepartments() {
    this.apiService.getDepartments().subscribe({
      next: (data: any[]) => this.departments = data,
      error: (err) => console.error('部署データの取得に失敗しました', err)
    });
  }

  toggleEdit() {
    this.isEditing = !this.isEditing;
  }

  savePreferences() {
    if (!this.user?.id) return;
    this.isSaving = true;

    const payload = {
      desiredDept: this.desiredDept,
      workLifeBalance: this.workLifeBalance
    };

    this.apiService.updatePreferences(this.user.id, payload).subscribe({
      next: (res) => {
        alert('希望条件を更新しました');
        this.isEditing = false;
        this.isSaving = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
        alert('更新に失敗しました');
        this.isSaving = false;
        this.cdr.detectChanges();
      }
    });
  }

  submitConsultation() {
    if (!this.inquiry.trim()) return;
    if (this.user?.id) {
      this.apiService.submitConsultation(this.user.id, this.inquiry).subscribe(() => {
        alert('人事へ相談を送信しました');
        this.inquiry = '';
      });
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}