<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::routes(['middleware' => ['auth:sanctum']]);

Broadcast::channel('user.{id}', function ($user, $id) {
    return (int) $user->ID === (int) $id; 
});
Broadcast::channel('admin-notifications', function ($user) {
    return $user->VaiTro === 'Admin';
});
