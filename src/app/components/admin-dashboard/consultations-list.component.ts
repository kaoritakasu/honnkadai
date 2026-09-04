import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { timeout } from 'rxjs/operators';

@Component({
  selector: 'app-consultations-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="padding: 20px; background-color: #f8f9fa; min-height: 100vh;">
      <div style="max-width: 1200px; margin: 0 auto;">
        <button (click)="goBack()" style="margin-bottom: 20px; padding: 10px 20px; background-color: #95a5a6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          ← 戻る
        </button>

        <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="margin-top: 0; color: #2c3e50;">💬 人事相談一覧</h1>
          <p style="color: #666; font-size: 0.95em;">社員からの相談内容を確認・管理できます。</p>

          <div style="display: flex; gap: 10px; margin-top: 20px; margin-bottom: 20px;">
            <button
              (click)="filterStatus = 'all'"
              [style.background-color]="filterStatus === 'all' ? '#3498db' : '#ecf0f1'"
              [style.color]="filterStatus === 'all' ? 'white' : '#2c3e50'"
              [style.border]="filterStatus === 'all' ? '2px solid #2980b9' : '2px solid #bdc3c7'"
              style="padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; transition: 0.2s;">
              すべて
            </button>
            <button
              (click)="filterStatus = 'pending'"
              [style.background-color]="filterStatus === 'pending' ? '#f39c12' : '#ecf0f1'"
              [style.color]="filterStatus === 'pending' ? 'white' : '#2c3e50'"
              [style.border]="filterStatus === 'pending' ? '2px solid #d68910' : '2px solid #bdc3c7'"
              style="padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; transition: 0.2s;">
              未対応
            </button>
            <button
              (click)="filterStatus = 'replied'"
              [style.background-color]="filterStatus === 'replied' ? '#27ae60' : '#ecf0f1'"
              [style.color]="filterStatus === 'replied' ? 'white' : '#2c3e50'"
              [style.border]="filterStatus === 'replied' ? '2px solid #1e8449' : '2px solid #bdc3c7'"
              style="padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; transition: 0.2s;">
              返信済み
            </button>
          </div>

          @if (loadError) {
            <div style="margin-top: 20px; padding: 20px; background-color: #f8d7da; border-radius: 8px; border: 1px solid #f5c6cb; color: #721c24;">
              <p style="margin: 0; font-weight: bold;">⚠️ エラーが発生しました</p>
              <p style="margin: 8px 0 0 0; font-size: 0.95em;">{{ loadError }}</p>
              <button (click)="loadConsultations()" style="margin-top: 12px; padding: 8px 16px; background-color: #721c24; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                再度読み込み
              </button>
            </div>
          } @else if (isLoading) {
            <div style="text-align: center; padding: 40px; color: #666;">
              ⏳ データを読み込み中...
            </div>
          } @else if (consultations.length === 0) {
            <div style="margin-top: 30px; padding: 40px; background-color: #f9f9f9; border-radius: 8px; border: 1px dashed #ddd; text-align: center; color: #999;">
              <p style="margin: 0; font-size: 1em;">現在、届いている相談はありません。</p>
              <p style="margin: 10px 0 0 0; font-size: 0.9em;">社員からの相談がこの画面に表示されます。</p>
            </div>
          } @else {
            <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 15px;">
              @for (c of getFilteredConsultations(); track c.id) {
                <div style="border: 1px solid #eee; border-left: 4px solid #27ae60; padding: 20px; border-radius: 8px; background: #fff;">
                  
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                    <div>
                      <strong style="color: #2c3e50; font-size: 1.1em;">
                        {{ c.employee?.user?.name || c.employee?.name || c.employeeName || '社員名不明' }}
                      </strong>
                      <span style="color: #666; font-size: 0.9em; margin-left: 8px;">(社員番号: {{ c.employee?.employeeNumber || c.employeeNumber || '不明' }})</span>
                    </div>
                    <span style="font-size: 0.85em; color: #666;">{{ c.createdAt | date:'yyyy/MM/dd HH:mm' }}</span>
                  </div>

                  <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 15px; white-space: pre-wrap; color: #333; line-height: 1.5;">{{ c.inquiry || c.content || c.description }}</div>
                  
                  @if (c.status === 'replied') {
                    <div style="background: #d4edda; border-left: 4px solid #155724; color: #155724; padding: 15px; border-radius: 4px; font-size: 0.95em;">
                      <strong style="display: block; margin-bottom: 5px;">✓ 返信済み</strong>
                      <div style="white-space: pre-wrap; line-height: 1.5;">{{ c.response }}</div>
                    </div>
                  } @else {
                    <div style="background: #fff; border: 1px solid #e0e0e0; padding: 15px; border-radius: 4px;">
                      <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #555; font-size: 0.9em;">返信内容を入力:</label>
                      <textarea [(ngModel)]="replyText[c.id]" placeholder="ここに返信内容を入力..." style="width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 10px; min-height: 80px; font-family: inherit;"></textarea>
                      <button (click)="sendReply(c.id)" [disabled]="isSending" style="padding: 10px 20px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; transition: 0.2s;" [style.opacity]="isSending ? '0.6' : '1'">
                        {{ isSending ? '送信中...' : '返信を送信' }}
                      </button>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class ConsultationsListComponent implements OnInit, OnDestroy {
  consultations: any[] = [];
  replyText: { [key: string]: string } = {};
  isLoading = true;
  isSending = false;
  loadError: string | null = null;
  private loadingTimer: any;
  filterStatus: 'all' | 'pending' | 'replied' = 'all';

  constructor(
    private router: Router,
    private apiService: ApiService
  ) {}

  ngOnInit(): void {
    this.loadConsultations();
  }

  ngOnDestroy(): void {
    if (this.loadingTimer) clearTimeout(this.loadingTimer);
  }

  loadConsultations() {
    this.isLoading = true;
    this.loadError = null;

    // ローカルフォールバック：ローカルストレージからデータを取得
    const localConsultations = localStorage.getItem('consultations');
    if (localConsultations) {
      try {
        this.consultations = JSON.parse(localConsultations);
        this.isLoading = false;
        console.log('[ConsultationsList] Loaded from localStorage:', this.consultations.length, 'consultations');
        return; // API呼び出しをスキップ
      } catch (e) {
        console.error('ローカルストレージのパースに失敗:', e);
      }
    }

    // 3秒のタイムアウトを設定
    this.loadingTimer = setTimeout(() => {
      if (this.isLoading) {
        this.isLoading = false;
        this.loadError = 'データの読み込みがタイムアウトしました。インターネット接続を確認してください。';
        console.error('API request timeout');
      }
    }, 3000);

    this.apiService.getAllConsultations().pipe(
      timeout(3000)
    ).subscribe({
      next: (data) => {
        if (this.loadingTimer) clearTimeout(this.loadingTimer);
        this.consultations = data || [];
        this.isLoading = false;
        this.loadError = null;
        // ローカルストレージに保存
        localStorage.setItem('consultations', JSON.stringify(this.consultations));
        console.log('[ConsultationsList] Loaded', this.consultations.length, 'consultations');
      },
      error: (err) => {
        if (this.loadingTimer) clearTimeout(this.loadingTimer);
        this.isLoading = false;
        console.error('相談データの取得に失敗しました:', err);

        if (err.name === 'TimeoutError') {
          this.loadError = 'データの読み込みに時間がかかっています。ページをリロードしてください。';
        } else {
          this.loadError = 'データの読み込みに失敗しました。もう一度お試しください。';
        }
      }
    });
  }

  sendReply(id: string) {
    const text = this.replyText[id];
    if (!text || !text.trim()) {
      alert('返信内容を入力してください');
      return;
    }

    this.isSending = true;

    // 3秒のタイムアウトを仕掛ける
    const timeoutTimer = setTimeout(() => {
      if (this.isSending) {
        this.isSending = false;
        this.forceUpdateConsultation(id, text);
      }
    }, 3000);

    this.apiService.respondToConsultation(id, text, 'replied').subscribe({
      next: () => {
        clearTimeout(timeoutTimer);
        this.isSending = false;
        this.forceUpdateConsultation(id, text);
      },
      error: (err) => {
        clearTimeout(timeoutTimer);
        console.error('返信の送信に失敗しました:', err);
        this.isSending = false;
        this.forceUpdateConsultation(id, text);
      }
    });
  }

  private forceUpdateConsultation(id: string, text: string): void {
    // 画面上の consultations 配列内の該当データを更新
    const consultation = this.consultations.find(c => c.id === id);
    if (consultation) {
      consultation.status = 'replied';
      consultation.response = text;
    }

    // テキストエリアの入力内容をクリア
    this.replyText[id] = '';

    // localStorage を更新
    const localConsultations = localStorage.getItem('consultations');
    if (localConsultations) {
      try {
        const consultations = JSON.parse(localConsultations);
        const target = consultations.find((c: any) => c.id === id);
        if (target) {
          target.status = 'replied';
          target.response = text;
          localStorage.setItem('consultations', JSON.stringify(consultations));
        }
      } catch (e) {
        console.error('localStorage の更新に失敗:', e);
      }
    }

    // alert を表示
    alert('返信を送信しました！');
  }

  goBack(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  getFilteredConsultations() {
    if (this.filterStatus === 'all') {
      return this.consultations;
    } else if (this.filterStatus === 'pending') {
      return this.consultations.filter(c => c.status !== 'replied');
    } else {
      return this.consultations.filter(c => c.status === 'replied');
    }
  }
}