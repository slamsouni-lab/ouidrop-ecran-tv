import { Injectable } from '@angular/core';
import { Dropper } from './dropper';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class Droppers {
    constructor(private http: HttpClient) {}

    getDroppers() {
        return this.http.get<Dropper[]>('/api/droppers');
    }
}