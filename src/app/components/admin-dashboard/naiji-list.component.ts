import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

interface Allocation {
  id: string;
  employeeId: string;
  departmentId: string;
  status: 'PENDING' | 'ASSIGNED' | 'REJECTED';
  reason: string;
  createdAt: string;
  employee: {
    id: string;
    employeeNumber: string;
    user: {
      name: string;
      email: string;
    };
  };
  department: {
    id: string;
    name: string;
  };
}

@Component({
  selector: 'app-naiji-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px; background-color: #f8f9fa; min-height: 100vh;">
      <div style="max-width: 1200px; margin: 0 auto;">
        <button (click)="goBack()" style="margin-bottom: 20px; padding: 10px 20px; background-color: #95a5a6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          ← 戻る
        </button>

        <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="margin-top: 0; color: #2c3e50;">📋 内示管理一覧</h1>
          <p style="color: #666; font-size: 0.95em;">配置シミュレーション結果を異動候補として管理し、面談後に確定処理を行えます。</p>

          @if (errorMessage) {
            <div style="padding: 15px; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; color: #721c24; margin-bottom: 20px; font-weight: 500;">
              <strong>⚠️ エラー:</strong> {{ errorMessage }}
            </div>
          }

          @if (isLoading) {
            <div style="padding: 30px; text-align: center; color: #666;">
              <p>読み込み中...</p>
            </div>
          }

          @if (!isLoading) {
            @if (allocations.length > 0) {
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <thead>
                <tr style="background-color: #f5f5f5; border-bottom: 2px solid #ddd;">
                  <th style="padding: 12px; text-align: left; font-weight: bold; color: #2c3e50;">社員番号</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold; color: #2c3e50;">社員名</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold; color: #2c3e50;">配置先部署</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold; color: #2c3e50;">ステータス</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold; color: #2c3e50;">理由</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold; color: #2c3e50;">作成日</th>
                  <th style="padding: 12px; text-align: center; font-weight: bold; color: #2c3e50;">操作</th>
                </tr>
              </thead>
              <tbody>
                @for (allocation of allocations; track allocation.id) {
                  <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 12px;">{{ allocation.employee?.employeeNumber || '未設定' }}</td>
                    <td style="padding: 12px;">{{ allocation.employee?.user?.name || '名前未設定' }}</td>
                    <td style="padding: 12px;">{{ allocation.department?.name || '未設定' }}</td>
                    <td style="padding: 12px;">
                      @switch (allocation.status) {
                        @case ('PENDING') {
                          <span style="background-color: #fff3cd; color: #856404; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; font-weight: bold;">面談待ち</span>
                        }
                        @case ('ASSIGNED') {
                          <span style="background-color: #d4edda; color: #155724; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; font-weight: bold;">確定</span>
                        }
                        @case ('REJECTED') {
                          <span style="background-color: #f8d7da; color: #721c24; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; font-weight: bold;">見送り</span>
                        }
                        @default {
                          <span style="background-color: #e2e3e5; color: #383d41; padding: 4px 8px; border-radius: 4px; font-size: 0.9em;">{{ allocation.status }}</span>
                        }
                      }
                    </td>
                    <td style="padding: 12px; font-size: 0.9em;">{{ allocation.reason }}</td>
                    <td style="padding: 12px; font-size: 0.9em;">{{ allocation.createdAt | date: 'yyyy-MM-dd HH:mm' }}</td>
                    <td style="padding: 12px; text-align: center;">
                      @if (allocation.status === 'PENDING') {
                        <button (click)="updateStatus(allocation.id, 'ASSIGNED')" style="margin-right: 8px; padding: 6px 12px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                          ✅ 確定
                        </button>
                        <button (click)="updateStatus(allocation.id, 'REJECTED')" style="padding: 6px 12px; background-color: white; color: #dc3545; border: 1px solid #dc3545; border-radius: 4px; cursor: pointer; font-weight: bold;">
                          ❌ 見送り
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            } @else {
              <div style="margin-top: 30px; padding: 40px; background-color: #f9f9f9; border-radius: 8px; border: 1px dashed #ddd; text-align: center; color: #999;">
                <p style="margin: 0; font-size: 1em;">現在、内示候補はありません。</p>
                <p style="margin: 10px 0 0 0; font-size: 0.9em;">シミュレーション実行後、この画面で異動候補を管理できます。</p>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class NaijiListComponent implements OnInit {
  allocations: Allocation[] = [];
  isLoading = true;
  errorMessage: string | null = null;

  constructor(private router: Router, private apiService: ApiService) {}

  ngOnInit(): void {
    console.log('[NaijiListComponent] Initializing...');
    this.loadAllocations();
  }

  loadAllocations(): void {
    this.apiService.getAllAllocations().subscribe({
      next: (response: any) => {
        // 配列でなければ中身を取り出す
        const data = Array.isArray(response) ? response : (response.data || response.results || []);
        console.log('一覧にセットするデータ:', data);

        // データを正規化：createdAt がない場合はデフォルト値をセット
        const normalizedData = data.map((item: any) => ({
          ...item,
          createdAt: item.createdAt || new Date().toISOString()
        }));

        this.allocations = normalizedData;
        this.isLoading = false;
        this.errorMessage = null;
      },
      error: (error) => {
        console.error('API通信エラー詳細:', error);
        console.error('ステータス:', error?.status);
        console.error('エラーメッセージ:', error?.error?.message || error?.message);
        this.errorMessage = `データの読み込みに失敗しました (${error?.status || '不明'})`;
        this.isLoading = false;
      }
    });
  }

  updateStatus(id: string, newStatus: 'ASSIGNED' | 'REJECTED'): void {
    const actionName = newStatus === 'ASSIGNED' ? '確定' : '見送り';
    if (confirm(`この内示を「${actionName}」にします。よろしいですか？`)) {
      this.apiService.updateAllocationStatus(id, newStatus).subscribe({
        next: () => {
          alert(`ステータスを「${actionName}」に更新しました。`);
          this.loadAllocations();
        },
        error: (err: any) => {
          console.error(err);
          alert('ステータスの更新に失敗しました。');
        }
      });
    }
  }

  goBack(): void {
    this.router.navigate(['/admin/dashboard']);
  }
}