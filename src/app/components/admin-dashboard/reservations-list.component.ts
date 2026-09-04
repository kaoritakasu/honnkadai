import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-reservations-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px; background-color: #f8f9fa; min-height: 100vh;">
      <div style="max-width: 1200px; margin: 0 auto;">
        <button (click)="goBack()" style="margin-bottom: 20px; padding: 10px 20px; background-color: #95a5a6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          ← 戻る
        </button>

        <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="margin-top: 0; color: #2c3e50;">📅 面談予約・受付ルール管理</h1>
          <p style="color: #666; font-size: 0.95em;">面談予約のスケジュール、カレンダー例外設定、基本的な受付ルールの管理はここから行えます。</p>

          <div style="margin-top: 30px; padding: 40px; background-color: #f9f9f9; border-radius: 8px; border: 1px dashed #ddd; text-align: center; color: #999;">
            <p style="margin: 0; font-size: 1em;">予約・ルール管理ページです。</p>
            <p style="margin: 10px 0 0 0; font-size: 0.9em;">カレンダー設定、受付ルール、例外設定などはここで管理できます。</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class ReservationsListComponent implements OnInit {
  constructor(private router: Router) {}

  ngOnInit(): void {}

  goBack(): void {
    this.router.navigate(['/admin/dashboard']);
  }
}
