import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'http://localhost:3000/api';
  private authTokenSubject = new BehaviorSubject<string | null>(localStorage.getItem('auth_token'));
  public authToken$ = this.authTokenSubject.asObservable();

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
  register(email: string, password: string, name: string, role: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, { email, password, name, role });
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

  simulateMultiDepartment(departmentIds: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/allocations/simulate-multi`, { departmentIds }, { headers: this.getHeaders() });
  }

  simulateBatchAllocation(data: any[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/allocations/simulate-batch`, data, { headers: this.getHeaders() });
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

  getAllConsultations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/consultations`, { headers: this.getHeaders() });
  }

  respondToConsultation(id: string, response: string, status: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/consultations/${id}`, { response, status }, { headers: this.getHeaders() });
  }

  submitConsultation(userId: string | number, inquiry: string) {
    return this.http.post(`${this.apiUrl}/employees/${userId}/consultation`, { inquiry }, { headers: this.getHeaders() });
  }
}
