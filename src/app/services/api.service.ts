import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl: string;
  private authTokenSubject = new BehaviorSubject<string | null>(localStorage.getItem('auth_token'));
  public authToken$ = this.authTokenSubject.asObservable();

  constructor(private http: HttpClient) {
    // Base URL を環境設定から取得し、フォールバックを設定
    this.apiUrl = this.getApiUrl();
  }

  private getApiUrl(): string {
    // 環境設定から取得
    if (environment.apiUrl) {
      return environment.apiUrl;
    }
    // フォールバック：現在のホスト名に基づいて動的に決定
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3000/api`;
  }

  getConfiguredApiUrl(): string {
    return this.apiUrl;
  }

  constructor(private http: HttpClient) {}

  setAuthToken(token: string) {
    localStorage.setItem('auth_token', token);
    this.authTokenSubject.next(token);
  }

  clearAuthToken() {
    localStorage.removeItem('auth_token');
    this.authTokenSubject.next(null);
  }

  private getHeaders() {
    const token = localStorage.getItem('auth_token');
    return new HttpHeaders({
      Authorization: token ? `Bearer ${token}` : ''
    });
  }

  // Auth
  register(email: string, password: string, name: string, role: string, employeeNumber?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, { email, password, name, role, employeeNumber });
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, { email, password });
  }

  // Employee
  getMyProfile(): Observable<any> {
    return this.http.get(`${this.apiUrl}/employees/me`, { headers: this.getHeaders() });
  }

  updateMyProfile(data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/employees/me`, data, { headers: this.getHeaders() });
  }

  getAllEmployees(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/employees`, { headers: this.getHeaders() });
  }

  getEmployee(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/employees/${id}`, { headers: this.getHeaders() });
  }

  getAssignmentDetails(userId: string | number) {
    return this.http.get(`${this.apiUrl}/employees/${userId}/assignment`, { headers: this.getHeaders() });
  }

  saveEmployeePreferences(userId: string | number, data: any) {
    return this.http.post(`${this.apiUrl}/employees/${userId}/preferences`, data, { headers: this.getHeaders() });
  }

  // Departments
  getDepartments(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/departments`);
  }

  createDepartment(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/departments`, data, { headers: this.getHeaders() });
  }

  updateDepartment(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/departments/${id}`, data, { headers: this.getHeaders() });
  }

  deleteDepartment(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/departments/${id}`, { headers: this.getHeaders() });
  }

  // Allocations
  simulateAllocation(departmentId: string, numPositions: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/allocations/simulate`, { departmentId, numPositions }, { headers: this.getHeaders() });
  }

  simulateMultiDepartment(departmentIds: string[], lastYearTotalRevenue?: number, simulationMode?: string): Observable<any> {
    const payload: any = { departmentIds };
    if (lastYearTotalRevenue && lastYearTotalRevenue > 0) {
      payload.lastYearTotalRevenue = lastYearTotalRevenue;
    }
    if (simulationMode) {
      payload.simulationMode = simulationMode;
    }
    return this.http.post(`${this.apiUrl}/allocations/simulate-multi`, payload, { headers: this.getHeaders() });
  }

  simulateBatchAllocation(payloadData: any, lastYearTotalRevenue?: number, simulationMode?: string, previousSimulationId?: string): Observable<any> {
    let payload: any = Array.isArray(payloadData) ? { employees: payloadData } : payloadData;
    if (lastYearTotalRevenue !== undefined) {
      payload.lastYearTotalRevenue = lastYearTotalRevenue;
    }
    if (simulationMode !== undefined) {
      payload.simulationMode = simulationMode;
    }
    if (previousSimulationId !== undefined) {
      payload.previousSimulationId = previousSimulationId;
    }
    return this.http.post<any>(`${this.apiUrl}/allocations/simulate-batch`, payload, { headers: this.getHeaders() });
  }

  simulateMultiDepartmentWithEmployees(employees: any[], lastYearTotalRevenue?: number, simulationMode?: string, previousSimulationId?: string): Observable<any> {
    let payload: any = Array.isArray(employees) ? { employees } : employees;
    if (lastYearTotalRevenue && lastYearTotalRevenue > 0) {
      payload.lastYearTotalRevenue = lastYearTotalRevenue;
    }
    if (simulationMode) {
      payload.simulationMode = simulationMode;
    }
    if (previousSimulationId) {
      payload.previousSimulationId = previousSimulationId;
    }
    return this.http.post<any>(`${this.apiUrl}/allocations/simulate-batch`, payload, { headers: this.getHeaders() });
  }

  saveSimulation(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/allocations/save`, payload, { headers: this.getHeaders() });
  }

  recalculateSimulation(adjustments: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/allocations/recalculate`, adjustments, { headers: this.getHeaders() });
  }

  recalculate(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/allocations/recalculate`, data, { headers: this.getHeaders() });
  }

  createAllocation(employeeId: string, departmentId: string, reason: string, recommendedLearning: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/allocations`, { employeeId, departmentId, reason, recommendedLearning }, { headers: this.getHeaders() });
  }

  confirmPlacement(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/allocations/confirm`, payload, { headers: this.getHeaders() });
  }

  updatePreferences(userId: string, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/employees/${userId}/preferences`, data, { headers: this.getHeaders() });
  }

  getPreferences(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/employees/${userId}/preferences`, { headers: this.getHeaders() });
  }

  getMyAllocations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/allocations/me`, { headers: this.getHeaders() });
  }

  getAllAllocations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/allocations`, { headers: this.getHeaders() });
  }

  // Admin
  getDashboard(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/dashboard`, { headers: this.getHeaders() });
  }

  sendFeedback(allocationId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/send-feedback/${allocationId}`, {}, { headers: this.getHeaders() });
  }

  // Consultations
  createConsultation(title: string, description: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/consultations`, { title, description }, { headers: this.getHeaders() });
  }

  getMyConsultations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/consultations/me`, { headers: this.getHeaders() });
  }

  getMyLatestSimulation(): Observable<any> {
    return this.http.get(`${this.apiUrl}/allocations/my-latest-simulation`, { headers: this.getHeaders() });
  }

  getAllConsultations(): Observable<any[]> {
    const url = `${this.apiUrl}/admin/consultations`;
    console.log(`[ApiService] Fetching all consultations from: ${url}`);
    return this.http.get<any[]>(url, { headers: this.getHeaders() }).pipe(
      tap(result => {
        console.log('[ApiService] Consultations retrieved successfully:', {
          count: result?.length || 0,
          items: result?.slice(0, 2).map(c => ({ id: c.id, status: c.status }))
        });
      }),
      catchError(error => {
        console.error('[ApiService] Failed to retrieve consultations:', {
          status: error.status,
          statusText: error.statusText,
          url: url,
          error: error.error
        });
        return throwError(() => error);
      })
    );
  }

  respondToConsultation(id: string, response: string, status: string): Observable<any> {
    const url = `${this.apiUrl}/consultations/${id}`;
    console.log(`[ApiService] Responding to consultation ${id} at: ${url}`);
    return this.http.put(url, { response, status }, { headers: this.getHeaders() }).pipe(
      tap(result => {
        console.log('[ApiService] Consultation response sent successfully:', { id, status });
      }),
      catchError(error => {
        console.error('[ApiService] Failed to respond to consultation:', {
          status: error.status,
          url: url,
          error: error.error
        });
        return throwError(() => error);
      })
    );
  }

  submitConsultation(userId: string | number, inquiry: string) {
    const url = `${this.apiUrl}/employees/${userId}/consultation`;
    console.log(`[ApiService] Submitting consultation for user ${userId} to: ${url}`);
    return this.http.post(url, { inquiry }, { headers: this.getHeaders() }).pipe(
      tap(result => {
        console.log('[ApiService] Consultation submitted successfully:', result);
      }),
      catchError(error => {
        console.error('[ApiService] Consultation submission failed:', {
          status: error.status,
          statusText: error.statusText,
          url: url,
          error: error.error
        });
        return throwError(() => error);
      })
    );
  }

  // Diagnostic methods
  testApiConnection(): Observable<any> {
    console.log(`[ApiService] Testing API connection to: ${this.apiUrl}/health`);
    return this.http.get(`${this.apiUrl}/health`).pipe(
      tap(result => console.log('[ApiService] Health check OK:', result)),
      catchError(error => {
        console.error('[ApiService] Health check failed:', error);
        return throwError(() => error);
      })
    );
  }

  getApiDiagnostics(): Observable<any> {
    console.log(`[ApiService] Current API configuration:`, {
      apiUrl: this.apiUrl,
      hostname: window.location.hostname,
      port: window.location.port,
      protocol: window.location.protocol
    });
    return this.http.get(`${this.apiUrl}/health`).pipe(
      tap(result => console.log('[ApiService] API is healthy:', result)),
      catchError(error => {
        console.error('[ApiService] API health check failed:', error);
        return throwError(() => error);
      })
    );
  }

  // Interview Reservations
  getAvailableSlots(date: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/interview/available-slots?date=${date}`, { headers: this.getHeaders() });
  }

  createReservation(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/interview/reservation`, data, { headers: this.getHeaders() });
  }

  getMyReservations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/interview/my-reservations`, { headers: this.getHeaders() });
  }

  getAllReservations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/interview/all-reservations`, { headers: this.getHeaders() });
  }

  cancelReservation(reservationId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/interview/reservation/${reservationId}`, {}, { headers: this.getHeaders() });
  }

  updateReservationStatus(reservationId: string, status: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/interview/admin/reservation/${reservationId}`, { status }, { headers: this.getHeaders() });
  }

  // Interview Availability Rules
  getAvailabilityRules(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/interview/availability-rules`, { headers: this.getHeaders() });
  }

  saveAvailabilityRule(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/interview/availability-rules`, data, { headers: this.getHeaders() });
  }

  deleteAvailabilityRule(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/interview/availability-rules/${id}`, { headers: this.getHeaders() });
  }

  // Interview Availability Exceptions
  getAvailabilityExceptions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/interview/availability-exceptions`, { headers: this.getHeaders() });
  }

  createAvailabilityException(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/interview/availability-exceptions`, data, { headers: this.getHeaders() });
  }

  deleteAvailabilityException(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/interview/availability-exceptions/${id}`, { headers: this.getHeaders() });
  }
}
