$('body').on('touchend', '.ticker.correct', function (e) {
    e.preventDefault();
    var total = parseInt($(this).parent('.row').find('.totalCount').text());
    var correctCount = parseInt($(this).text());
    var correctPercent;

    correctCount++
    total++
    correctPercent = Math.ceil(correctCount / total * 100) + '%';

    $(this).text(correctCount);
    $(this).parent('.row').find('.totalCount').text(total);
    $(this).parent('.row').find('.percentValue').text(correctPercent);

});

$('body').on('touchend', '.ticker.incorrect', function (e) {
    e.preventDefault();
    var total = parseInt($(this).parent('.row').find('.totalCount').text());
    var incorrectCount = parseInt($(this).text());
    var correctCount = parseInt($(this).parent('.row').find('.correct').text());
    var correctPercent;

    incorrectCount++
    total++
    correctPercent = Math.ceil(correctCount / total * 100) + '%';

    $(this).text(incorrectCount);
    $(this).parent('.row').find('.totalCount').text(total);
    $(this).parent('.row').find('.percentValue').text(correctPercent);

});

$('body').on('click', '.delete-row', function () {
    $(this).parents('.row').remove();
});


$('#add-row').click(function () {
    $(".row.template").clone().attr('class', 'row').appendTo(".row-wrapper");
})

$('#clear').click(function(){
    $('.row-wrapper .row').remove();
    $(".row.template").clone().attr('class', 'row').appendTo(".row-wrapper");
})