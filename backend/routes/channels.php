<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('user.{id}', function ($user, $id) {
    // Tùy thuộc vào Database của bạn, nếu khóa chính NguoiDung là ID (viết hoa) thì sửa thành $user->ID
    return (int) $user->ID === (int) $id; 
});
